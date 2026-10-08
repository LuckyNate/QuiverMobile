#include <jni.h>
#include <GLES3/gl3.h>
#include <android/log.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <vector>
#include <chrono>

namespace {
constexpr float PI=3.14159265358979323846f;
constexpr double SEA_LEVEL_RADIUS_METERS=100000.0;
constexpr int MAX_LOD=18;
constexpr float SPLIT_PIXELS=42.f;
constexpr float FULL_OPACITY_PIXELS=105.f;
constexpr size_t MAX_LINE_VERTICES=240000;

struct Vec { float x,y,z; };
struct LineVertex { Vec position; float alpha; };
struct Triangle { Vec a,b,c; };
Vec add(Vec a,Vec b){return {a.x+b.x,a.y+b.y,a.z+b.z};}
Vec subtract(Vec a,Vec b){return {a.x-b.x,a.y-b.y,a.z-b.z};}
Vec scale(Vec v,float k){return {v.x*k,v.y*k,v.z*k};}
float dot(Vec a,Vec b){return a.x*b.x+a.y*b.y+a.z*b.z;}
float length(Vec v){return std::sqrt(dot(v,v));}
Vec normalize(Vec a){float l=length(a);return scale(a,1.f/l);}
Vec cross(Vec a,Vec b){return {a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x};}
Vec midpoint(Vec a,Vec b){return normalize(scale(add(a,b),.5f));}
float clamp01(float v){return std::clamp(v,0.f,1.f);}

const std::array<Triangle,20>& roots(){
 static const std::array<Triangle,20> data=[]{
  const float t=(1.f+std::sqrt(5.f))/2.f;
  const std::array<Vec,12> p={
   normalize({-1,t,0}),normalize({1,t,0}),normalize({-1,-t,0}),normalize({1,-t,0}),
   normalize({0,-1,t}),normalize({0,1,t}),normalize({0,-1,-t}),normalize({0,1,-t}),
   normalize({t,0,-1}),normalize({t,0,1}),normalize({-t,0,-1}),normalize({-t,0,1})
  };
  constexpr int ids[60]={
   0,11,5,0,5,1,0,1,7,0,7,10,0,10,11,1,5,9,5,11,4,
   11,10,2,10,7,6,7,1,8,3,9,4,3,4,2,3,2,6,3,6,8,
   3,8,9,4,9,5,2,4,11,6,2,10,8,6,7,9,8,1
  };
  std::array<Triangle,20> tris{};
  for(int i=0;i<20;i++)tris[i]={p[ids[i*3]],p[ids[i*3+1]],p[ids[i*3+2]]};
  return tris;
 }();
 return data;
}

GLuint program=0,vao=0,vbo=0;
int width=1,height=1;
float yaw=.0f,pitch=.25f,distance=8.f,moveX=0.f,moveY=0.f;
Vec position={0,0,1};
Vec tangentEast(){return normalize(cross({0,1,0},position));}
Vec tangentNorth(){return normalize(cross(position,tangentEast()));}
Vec forward(){return {std::sin(yaw),0,std::cos(yaw)};}

std::vector<LineVertex> visibleLines;
int activeNodes=0, deepestLevel=0;
Vec cameraForward, cameraRight, cameraUp;
float tanHalfHorizontal=1.f, tanHalfVertical=1.f;

void identity(float* m){std::fill(m,m+16,0.f);for(int i=0;i<4;i++)m[i*5]=1.f;}
void multiply(float* out,const float* a,const float* b){
 for(int col=0;col<4;col++)for(int row=0;row<4;row++){
  float v=0;for(int k=0;k<4;k++)v+=a[k*4+row]*b[col*4+k];out[col*4+row]=v;
 }
}
void perspective(float* m,float fovy,float aspect,float nearZ,float farZ){
 std::fill(m,m+16,0.f);float f=1.f/std::tan(fovy/2.f);
 m[0]=f/aspect;m[5]=f;m[10]=(farZ+nearZ)/(nearZ-farZ);
 m[11]=-1;m[14]=(2*farZ*nearZ)/(nearZ-farZ);
}
void view(float* m,Vec eye){
 Vec forward=normalize(scale(eye,-1.f));
 Vec right=normalize(cross(forward,{0,1,0}));
 Vec up=cross(right,forward);
 identity(m);
 m[0]=right.x;m[4]=right.y;m[8]=right.z;
 m[1]=up.x;m[5]=up.y;m[9]=up.z;
 m[2]=-forward.x;m[6]=-forward.y;m[10]=-forward.z;
 m[12]=-dot(right,eye);m[13]=-dot(up,eye);m[14]=dot(forward,eye);
}
GLuint compile(GLenum kind,const char* source){
 GLuint result=glCreateShader(kind);glShaderSource(result,1,&source,nullptr);glCompileShader(result);
 GLint success=0;glGetShaderiv(result,GL_COMPILE_STATUS,&success);
 if(!success){char log[1024]={};glGetShaderInfoLog(result,1024,nullptr,log);
  __android_log_print(ANDROID_LOG_ERROR,"QuiverMobile","Shader compile failed: %s",log);}
 return result;
}
void edge(Vec a,Vec b,float alpha){
 if(visibleLines.size()+2>MAX_LINE_VERTICES)return;
 visibleLines.push_back({a,alpha});visibleLines.push_back({b,alpha});
}
// A conservative spherical bound enables whole quadtree branches to be
// rejected before creating any children. Coordinates here are radius units.
bool visible(Triangle tri,Vec eye,Vec center,float radius){
 Vec towards=subtract(center,eye);
 float depth=dot(towards,cameraForward);
 if(depth+radius<=0.f)return false;
 float lateral=dot(towards,cameraRight);
 float vertical=dot(towards,cameraUp);
 // Plane distance in the normalized camera basis. Conservative radius
 // expansion prevents large root triangles being clipped too early.
 if(std::abs(lateral)>std::max(0.f,depth)*tanHalfHorizontal+radius*2.f)return false;
 if(std::abs(vertical)>std::max(0.f,depth)*tanHalfVertical+radius*2.f)return false;
 float eyeLength=length(eye);
 if(eyeLength>1.00001f && dot(center,scale(eye,1.f/eyeLength))+radius<1.f/eyeLength)return false;
 return true;
}
void traverse(Triangle tri,int level,Vec eye,float pixelsPerUnit){
 Vec center=normalize(add(add(tri.a,tri.b),tri.c));
 float radius=std::max({length(subtract(tri.a,center)),
                        length(subtract(tri.b,center)),
                        length(subtract(tri.c,center))});
 if(!visible(tri,eye,center,radius))return;
 float edgeLength=std::max({length(subtract(tri.a,tri.b)),
                            length(subtract(tri.b,tri.c)),
                            length(subtract(tri.c,tri.a))});
 float nearestDistance=std::max(.000003f,length(subtract(eye,center))-radius);
 float projected=edgeLength*pixelsPerUnit/nearestDistance;
 float edgeMeters=edgeLength*float(SEA_LEVEL_RADIUS_METERS);
 // One-meter geometry is needed only for nearby, screen-visible terrain.
 // Distant branches stop refining based on projected edge size.
 bool nearSurface=distance<150.f &&
   (length(subtract(center,position))-radius)*SEA_LEVEL_RADIUS_METERS<160.f;
 bool subdivide=level<MAX_LOD && edgeMeters>1.f &&
   (projected>SPLIT_PIXELS || nearSurface);
 if(!subdivide || visibleLines.size()+16>=MAX_LINE_VERTICES)return;
 ++activeNodes;deepestLevel=std::max(deepestLevel,level+1);
 Vec ab=midpoint(tri.a,tri.b),bc=midpoint(tri.b,tri.c),ca=midpoint(tri.c,tri.a);
 // Newly exposed internal edges fade as their screen size shrinks.
 float alpha=clamp01((projected-SPLIT_PIXELS)/(FULL_OPACITY_PIXELS-SPLIT_PIXELS));
 if(nearSurface)alpha=std::max(alpha,.85f);
 if(alpha>.01f){edge(ab,bc,alpha);edge(bc,ca,alpha);edge(ca,ab,alpha);}
 traverse({tri.a,ab,ca},level+1,eye,pixelsPerUnit);
 traverse({tri.b,bc,ab},level+1,eye,pixelsPerUnit);
 traverse({tri.c,ca,bc},level+1,eye,pixelsPerUnit);
 traverse({ab,bc,ca},level+1,eye,pixelsPerUnit);
}
void rebuild(Vec eye){
 visibleLines.clear();activeNodes=0;deepestLevel=0;
 float pixelScale=height/(2.f*std::tan(55.f*PI/360.f));
 for(const auto &tri:roots()){
  Vec center=normalize(add(add(tri.a,tri.b),tri.c));
  float radius=std::max({length(subtract(tri.a,center)),
                         length(subtract(tri.b,center)),
                         length(subtract(tri.c,center))});
  if(!visible(tri,eye,center,radius))continue;
  edge(tri.a,tri.b,.85f);edge(tri.b,tri.c,.85f);edge(tri.c,tri.a,.85f);
  traverse(tri,0,eye,pixelScale);
 }
}
}

extern "C" JNIEXPORT void JNICALL Java_com_luckynate_quivermobile_MainActivity_nativeInit(JNIEnv*,jobject){
 const char* vs=R"(#version 300 es
 layout(location=0) in vec3 aPosition;
 layout(location=1) in float aAlpha;
 uniform mat4 uMVP;
 out float opacity;
 uniform vec3 uOrigin;
 void main(){opacity=aAlpha;gl_Position=uMVP*vec4(aPosition-uOrigin,1.0);}
 )";
 const char* fs=R"(#version 300 es
 precision mediump float;
 in float opacity;
 out vec4 color;
 void main(){color=vec4(1.0,0.0,1.0,opacity);}
 )";
 GLuint v=compile(GL_VERTEX_SHADER,vs),f=compile(GL_FRAGMENT_SHADER,fs);
 program=glCreateProgram();glAttachShader(program,v);glAttachShader(program,f);
 glLinkProgram(program);glDeleteShader(v);glDeleteShader(f);
 glGenVertexArrays(1,&vao);glBindVertexArray(vao);
 glGenBuffers(1,&vbo);glBindBuffer(GL_ARRAY_BUFFER,vbo);
 glBufferData(GL_ARRAY_BUFFER,MAX_LINE_VERTICES*sizeof(LineVertex),nullptr,GL_DYNAMIC_DRAW);
 glVertexAttribPointer(0,3,GL_FLOAT,GL_FALSE,sizeof(LineVertex),(void*)0);
 glEnableVertexAttribArray(0);
 glVertexAttribPointer(1,1,GL_FLOAT,GL_FALSE,sizeof(LineVertex),(void*)sizeof(Vec));
 glEnableVertexAttribArray(1);glBindVertexArray(0);
 glEnable(GL_BLEND);glBlendFunc(GL_SRC_ALPHA,GL_ONE_MINUS_SRC_ALPHA);
 glDisable(GL_DEPTH_TEST);
 glClearColor(.035f,.045f,.075f,1.f);
 __android_log_print(ANDROID_LOG_INFO,"QuiverMobile","Reference sphere radius %.0f meters; dynamic wireframe LOD",SEA_LEVEL_RADIUS_METERS);
}
extern "C" JNIEXPORT void JNICALL Java_com_luckynate_quivermobile_MainActivity_nativeResize(JNIEnv*,jobject,jint w,jint h){
 width=std::max(1,(int)w);height=std::max(1,(int)h);glViewport(0,0,width,height);
}
extern "C" JNIEXPORT void JNICALL Java_com_luckynate_quivermobile_MainActivity_nativeMove(JNIEnv*,jobject,jfloat x,jfloat y){
 moveX=std::clamp(x,-1.f,1.f);moveY=std::clamp(y,-1.f,1.f);
}
extern "C" JNIEXPORT void JNICALL Java_com_luckynate_quivermobile_MainActivity_nativeDraw(JNIEnv*,jobject){
 static auto before=std::chrono::steady_clock::now();
 auto now=std::chrono::steady_clock::now();
 float dt=std::min(.05f,std::chrono::duration<float>(now-before).count());before=now;
 Vec up=position;
 Vec east=tangentEast(),north=tangentNorth();
 Vec facing=add(scale(north,std::cos(yaw)),scale(east,std::sin(yaw)));
 Vec side=add(scale(east,std::cos(yaw)),scale(north,-std::sin(yaw)));
 Vec movement=add(scale(side,moveX),scale(facing,moveY));
 if(length(movement)>.001f) position=normalize(add(position,scale(movement,5.f*dt/100000.f)));
 up=position;east=tangentEast();north=tangentNorth();
 Vec cameraFacing=add(scale(north,std::cos(yaw)),scale(east,std::sin(yaw)));
 Vec eye=add(scale(up,1.f),scale(cameraFacing,-distance*std::cos(pitch)/100000.f));
 eye=add(eye,scale(up,(2.f+distance*std::sin(pitch))/100000.f));
 cameraForward=normalize(subtract(add(position,scale(up,.00001f)),eye));
 cameraRight=normalize(cross(cameraForward,up));
 cameraUp=cross(cameraRight,cameraForward);
 tanHalfVertical=std::tan(55.f*PI/360.f);
 tanHalfHorizontal=tanHalfVertical*float(width)/float(height);
 rebuild(eye);
 // Display capsule as a wireframe ring and vertical silhouette on the sea-level reference sphere.
 Vec right=east;
 for(int j=0;j<12;j++){
  float a=j*2*PI/12,b=(j+1)*2*PI/12;
  Vec radial=add(scale(right,std::cos(a)),scale(north,std::sin(a)));
  Vec next=add(scale(right,std::cos(b)),scale(north,std::sin(b)));
  Vec bottom=add(up,scale(radial,.35f/100000.f));
  Vec top=add(bottom,scale(up,1.8f/100000.f));
  Vec other=add(up,scale(next,.35f/100000.f));
  edge(bottom,top,1.f);edge(bottom,other,1.f);
  edge(top,add(other,scale(up,1.8f/100000.f)),1.f);
 }
 float p[16],v[16],mvp[16];
 perspective(p,55*PI/180.f,(float)width/height,.0000003f,20.f);
 // Work in units of planetary radius, relative to player for floating-point precision.
 Vec localEye=subtract(eye,position);
 Vec localTarget=scale(up,.00001f);
 Vec f=normalize(subtract(localTarget,localEye)),r=normalize(cross(f,up)),u=cross(r,f);
 identity(v);
 v[0]=r.x;v[4]=r.y;v[8]=r.z;
 v[1]=u.x;v[5]=u.y;v[9]=u.z;
 v[2]=-f.x;v[6]=-f.y;v[10]=-f.z;
 v[12]=-dot(r,localEye);v[13]=-dot(u,localEye);v[14]=dot(f,localEye);
 multiply(mvp,p,v);
 glUseProgram(program);
 glUniformMatrix4fv(glGetUniformLocation(program,"uMVP"),1,GL_FALSE,mvp);
 glUniform3f(glGetUniformLocation(program,"uOrigin"),position.x,position.y,position.z);
 glBindVertexArray(vao);
 glBindBuffer(GL_ARRAY_BUFFER,vbo);
 glBufferSubData(GL_ARRAY_BUFFER,0,visibleLines.size()*sizeof(LineVertex),visibleLines.data());
 glDrawArrays(GL_LINES,0,(GLsizei)visibleLines.size());
}
extern "C" JNIEXPORT void JNICALL Java_com_luckynate_quivermobile_MainActivity_nativeOrbit(JNIEnv*,jobject,jfloat dx,jfloat dy,jfloat zoom){
 yaw+=dx;pitch=std::clamp(pitch+dy,-.1f,1.45f);
 distance=std::clamp(distance*zoom,3.f,600000.f);
}
