#include <jni.h>
#include <GLES3/gl3.h>
#include <vector>
#include <cmath>
#include <cstdint>
#include <algorithm>
#include <unordered_map>
#include <android/log.h>

namespace {
constexpr float PI = 3.14159265358979323846f;
constexpr double SEA_LEVEL_RADIUS_METERS = 100000.0;
struct Vec { float x,y,z; };
Vec norm(Vec a) { float l=std::sqrt(a.x*a.x+a.y*a.y+a.z*a.z); return {a.x/l,a.y/l,a.z/l}; }
Vec sub(Vec a,Vec b){return {a.x-b.x,a.y-b.y,a.z-b.z};}
Vec cross(Vec a,Vec b){return {a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x};}
float dot(Vec a,Vec b){return a.x*b.x+a.y*b.y+a.z*b.z;}
std::vector<Vec> positions;
std::vector<uint16_t> indices;
GLuint program=0, vao=0, vbo=0, ebo=0;
int width=1,height=1;
float yaw=.42f,pitch=.28f,distance=2.7f;
void identity(float* m) {std::fill(m,m+16,0.f);for(int i=0;i<4;i++)m[i*5]=1;}
void multiply(float* out,const float* a,const float* b) {
 for(int col=0;col<4;col++)for(int row=0;row<4;row++){
 float v=0;for(int k=0;k<4;k++)v+=a[k*4+row]*b[col*4+k];out[col*4+row]=v;
 }
}
void perspective(float* m,float fovy,float aspect,float nearZ,float farZ){
 std::fill(m,m+16,0.f);float f=1.f/std::tan(fovy/2);
 m[0]=f/aspect;m[5]=f;m[10]=(farZ+nearZ)/(nearZ-farZ);
 m[11]=-1;m[14]=(2*farZ*nearZ)/(nearZ-farZ);
}
void view(float* m, Vec eye) {
 Vec forward=norm({-eye.x,-eye.y,-eye.z});
 Vec worldUp={0,1,0};Vec right=norm(cross(forward,worldUp));
 Vec up=cross(right,forward);
 identity(m);
 m[0]=right.x;m[4]=right.y;m[8]=right.z;
 m[1]=up.x;m[5]=up.y;m[9]=up.z;
 m[2]=-forward.x;m[6]=-forward.y;m[10]=-forward.z;
 m[12]=-dot(right,eye);m[13]=-dot(up,eye);m[14]=dot(forward,eye);
}
GLuint shader(GLenum type,const char* src){
 GLuint s=glCreateShader(type);glShaderSource(s,1,&src,nullptr);glCompileShader(s);
 GLint ok=0;glGetShaderiv(s,GL_COMPILE_STATUS,&ok);
 if(!ok){char log[1024]={};glGetShaderInfoLog(s,sizeof(log),nullptr,log);__android_log_print(ANDROID_LOG_ERROR,"QuiverMobile","Shader: %s",log);}
 return s;
}
void geometry(){
 const float t=(1.f+std::sqrt(5.f))/2.f;
 positions={
 norm({-1,t,0}),norm({1,t,0}),norm({-1,-t,0}),norm({1,-t,0}),
 norm({0,-1,t}),norm({0,1,t}),norm({0,-1,-t}),norm({0,1,-t}),
 norm({t,0,-1}),norm({t,0,1}),norm({-t,0,-1}),norm({-t,0,1})};
 indices={0,11,5,0,5,1,0,1,7,0,7,10,0,10,11,1,5,9,5,11,4,
 11,10,2,10,7,6,7,1,8,3,9,4,3,4,2,3,2,6,3,6,8,
 3,8,9,4,9,5,2,4,11,6,2,10,8,6,7,9,8,1};
 for(int level=0;level<4;level++){
 std::vector<uint16_t> next;next.reserve(indices.size()*4);
 // Shared edge midpoint cache prevents cracks and duplicate edge vertices.
 std::unordered_map<uint32_t,uint16_t> cache;
 auto mid=[&](uint16_t a,uint16_t b)->uint16_t{
 uint32_t lo=std::min(a,b),hi=std::max(a,b),key=(lo<<16)|hi;
 auto it=cache.find(key);if(it!=cache.end())return it->second;
 Vec p=norm({(positions[a].x+positions[b].x)*.5f,
 (positions[a].y+positions[b].y)*.5f,(positions[a].z+positions[b].z)*.5f});
 uint16_t id=static_cast<uint16_t>(positions.size());positions.push_back(p);
 cache[key]=id;return id;};
 for(size_t i=0;i<indices.size();i+=3){
 uint16_t a=indices[i],b=indices[i+1],c=indices[i+2];
 uint16_t ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
 next.insert(next.end(),{a,ab,ca,b,bc,ab,c,ca,bc,ab,bc,ca});
 }indices.swap(next);
 }
}
}
extern "C" JNIEXPORT void JNICALL Java_com_luckynate_quivermobile_MainActivity_nativeInit(JNIEnv*,jobject){
 const char* vs=R"(#version 300 es
 layout(location=0) in vec3 aPosition;
 uniform mat4 uMVP;
 out vec3 normal;
 void main(){normal=aPosition;gl_Position=uMVP*vec4(aPosition,1.0);}
 )";
 const char* fs=R"(#version 300 es
 precision mediump float;
 in vec3 normal;
 out vec4 color;
 void main(){float light=0.48+0.52*max(dot(normalize(normal),normalize(vec3(0.5,0.9,1.0))),0.0);
 color=vec4(light,0.0,light,1.0);}
 )";
 GLuint vert=shader(GL_VERTEX_SHADER,vs),frag=shader(GL_FRAGMENT_SHADER,fs);
 program=glCreateProgram();glAttachShader(program,vert);glAttachShader(program,frag);
 glLinkProgram(program);glDeleteShader(vert);glDeleteShader(frag);
 if(positions.empty())geometry();
 glGenVertexArrays(1,&vao);glBindVertexArray(vao);
 glGenBuffers(1,&vbo);glBindBuffer(GL_ARRAY_BUFFER,vbo);
 glBufferData(GL_ARRAY_BUFFER,positions.size()*sizeof(Vec),positions.data(),GL_STATIC_DRAW);
 glGenBuffers(1,&ebo);glBindBuffer(GL_ELEMENT_ARRAY_BUFFER,ebo);
 glBufferData(GL_ELEMENT_ARRAY_BUFFER,indices.size()*sizeof(uint16_t),indices.data(),GL_STATIC_DRAW);
 glVertexAttribPointer(0,3,GL_FLOAT,GL_FALSE,sizeof(Vec),(void*)0);
 glEnableVertexAttribArray(0);glBindVertexArray(0);
 glEnable(GL_DEPTH_TEST);
 glClearColor(0.035f,0.045f,0.075f,1.f);
 __android_log_print(ANDROID_LOG_INFO,"QuiverMobile","Reference radius %.0f m; triangles %zu",SEA_LEVEL_RADIUS_METERS,indices.size()/3);
}
extern "C" JNIEXPORT void JNICALL Java_com_luckynate_quivermobile_MainActivity_nativeResize(JNIEnv*,jobject,jint w,jint h){
 width=std::max(1,(int)w);height=std::max(1,(int)h);glViewport(0,0,width,height);
}
extern "C" JNIEXPORT void JNICALL Java_com_luckynate_quivermobile_MainActivity_nativeDraw(JNIEnv*,jobject){
 glClear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT);
 Vec eye={distance*std::cos(pitch)*std::sin(yaw),distance*std::sin(pitch),distance*std::cos(pitch)*std::cos(yaw)};
 float p[16],v[16],mvp[16];perspective(p,55*PI/180.f,(float)width/height,.05f,20.f);
 view(v,eye);multiply(mvp,p,v);
 glUseProgram(program);glUniformMatrix4fv(glGetUniformLocation(program,"uMVP"),1,GL_FALSE,mvp);
 glBindVertexArray(vao);glDrawElements(GL_TRIANGLES,(GLsizei)indices.size(),GL_UNSIGNED_SHORT,nullptr);
}
extern "C" JNIEXPORT void JNICALL Java_com_luckynate_quivermobile_MainActivity_nativeOrbit(JNIEnv*,jobject,jfloat dx,jfloat dy,jfloat zoom){
 yaw+=dx;pitch=std::clamp(pitch+dy,-1.45f,1.45f);
 distance=std::clamp(distance*zoom,1.04f,10.f);
}
