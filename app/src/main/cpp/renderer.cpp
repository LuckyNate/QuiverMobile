#include <jni.h>
#include <GLES3/gl3.h>
#include <android/log.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <vector>
#include <chrono>
#include <cstdio>
#include <unordered_map>
#include <cstdint>
#include <android/asset_manager.h>
#include <android/asset_manager_jni.h>
#include <string>
#include <cstring>
#include <cstdlib>


namespace {
constexpr float PI=3.14159265358979323846f;
constexpr double ROOT_EDGE_METERS=128.0; // 2^7 meters, regular D20 edge
const double SEA_LEVEL_RADIUS_METERS=ROOT_EDGE_METERS*std::sqrt(10.0+2.0*std::sqrt(5.0))/4.0;
constexpr int MAX_LOD=18;
constexpr float SPLIT_PIXELS=42.f;
constexpr float FULL_OPACITY_PIXELS=105.f;
constexpr size_t MAX_LINE_VERTICES=240000;
// Maximum distance in meters from player for each subdivision level.
// Edit each entry independently to tune the hierarchy's extent.
constexpr std::array<float,19> LOD_MAX_DISTANCE_METERS = {
  1.0e9f,1.0e9f,1.0e9f,1.0e9f,1.0e9f,1.0e9f,
  1.0e9f,1.0e9f,1.0e9f,1.0e9f,1.0e9f,1.0e9f,
  1600.f,800.f,400.f,200.f,100.f,50.f,25.f
};
constexpr float LOD_FADE_FRACTION=.20f;

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
GLuint meshProgram=0,meshVao=0,meshVbo=0,meshIbo=0;
GLsizei meshIndexCount=0;
float meshGray[4]={.5f,.5f,.5f,1.f};
int width=1,height=1;
float yaw=.0f,pitch=.25f,distance=8.f,moveX=0.f,moveY=0.f;
Vec position={0,0,1};
Vec tangentEast(){return normalize(cross({0,1,0},position));}
Vec tangentNorth(){return normalize(cross(position,tangentEast()));}
Vec forward(){return {std::sin(yaw),0,std::cos(yaw)};}

std::vector<LineVertex> visibleLines;
struct Leaf { Triangle tri; float alpha; };
std::vector<Leaf> selectedLeaves;
int activeNodes=0, deepestLevel=0;
int frustumRejected=0, horizonRejected=0, visiblePatches=0, radiusRejected=0, lodStopped=0;
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
// Conservative spherical patch bound, including curved edges and interior.
// The extra chord allowance avoids dropping partially visible coarse patches.
float patchRadius(Triangle tri,Vec center){
 float chord=std::max({length(subtract(tri.a,center)),
                       length(subtract(tri.b,center)),
                       length(subtract(tri.c,center))});
 return std::min(2.f,chord+chord*chord);
}
// Reject whole branches only when their conservative bound lies fully outside.
bool visible(Triangle tri,Vec eye,Vec center,float radius){
 (void)tri;
 Vec delta=subtract(center,eye);
 float depth=dot(delta,cameraForward);
 // Signed frustum-plane distance; normals are scaled by plane length.
 float sideAllowance=radius*std::sqrt(1.f+tanHalfHorizontal*tanHalfHorizontal);
 float topAllowance=radius*std::sqrt(1.f+tanHalfVertical*tanHalfVertical);
 if(depth+radius<0.f){++frustumRejected;return false;}
 if(std::abs(dot(delta,cameraRight))-depth*tanHalfHorizontal>sideAllowance){++frustumRejected;return false;}
 if(std::abs(dot(delta,cameraUp))-depth*tanHalfVertical>topAllowance){++frustumRejected;return false;}
 float cameraRadius=length(eye);
 // A planet blocks a patch only when the complete angular bound is
 // behind the tangent horizon. Keep everything when at/inside sea level.
 if(cameraRadius>1.000001f){
  float horizon=1.f/cameraRadius;
  float facing=dot(center,scale(eye,1.f/cameraRadius));
  if(facing+radius<horizon){++horizonRejected;return false;}
 }
 ++visiblePatches;
 return true;
}
void traverse(Triangle tri,int level,Vec eye,float pixelsPerUnit,float inheritedAlpha=1.f){
 Vec center=normalize(add(add(tri.a,tri.b),tri.c));
 float radius=patchRadius(tri,center);
 if(!visible(tri,eye,center,radius))return;
 float edgeLength=std::max({length(subtract(tri.a,tri.b)),
                            length(subtract(tri.b,tri.c)),
                            length(subtract(tri.c,tri.a))});
 float nearestDistance=std::max(.000003f,length(subtract(eye,center))-radius);
 float projected=edgeLength*pixelsPerUnit/nearestDistance;
 float edgeMeters=edgeLength*float(SEA_LEVEL_RADIUS_METERS);
 // Visibility decides what we draw; player distance caps how fine it gets.
 // Nearest extent keeps a patch alive if it overlaps the radius.
 if(level>=MAX_LOD){selectedLeaves.push_back({tri,inheritedAlpha});++lodStopped;return;}
 const int childLevel=level+1;
 float playerMinDistance=std::max(0.f,
    (length(subtract(center,position))-radius)*float(SEA_LEVEL_RADIUS_METERS));
 float maximumDistance=LOD_MAX_DISTANCE_METERS[childLevel];
 bool insideRadius=playerMinDistance<maximumDistance;
 bool nearSurface=distance<150.f && childLevel>=12 && insideRadius;
 bool subdivide=childLevel<=MAX_LOD && insideRadius &&
   edgeMeters>1.f && (projected>SPLIT_PIXELS || nearSurface);
 if(!insideRadius)++radiusRejected;
 if(!subdivide || selectedLeaves.size()*6>=MAX_LINE_VERTICES){
   selectedLeaves.push_back({tri,inheritedAlpha});++lodStopped;return;
 }
 ++activeNodes;deepestLevel=std::max(deepestLevel,childLevel);
 Vec ab=midpoint(tri.a,tri.b),bc=midpoint(tri.b,tri.c),ca=midpoint(tri.c,tri.a);
 float alpha=clamp01((projected-SPLIT_PIXELS)/(FULL_OPACITY_PIXELS-SPLIT_PIXELS));
 if(nearSurface)alpha=std::max(alpha,.85f);
 if(maximumDistance<1.0e8f){
   float fadeStart=maximumDistance*(1.f-LOD_FADE_FRACTION);
   alpha*=clamp01((maximumDistance-playerMinDistance)/(maximumDistance-fadeStart));
 }
 // Children replace the parent; only leaf boundaries reach the GPU.
 // Preserve fade on the selected branches, rather than drawing ancestors.
 float leafAlpha=std::max(.08f,std::min(inheritedAlpha,alpha));
 traverse({tri.a,ab,ca},level+1,eye,pixelsPerUnit,leafAlpha);
 traverse({tri.b,bc,ab},level+1,eye,pixelsPerUnit,leafAlpha);
 traverse({tri.c,ca,bc},level+1,eye,pixelsPerUnit,leafAlpha);
 traverse({ab,bc,ca},level+1,eye,pixelsPerUnit,leafAlpha);
}
void buildLeafEdges(){
 // Shared edges are coalesced into a single GPU line, keeping the higher opacity.
 // Spherical arc subdivision at LOD boundaries is handled by subdividing
 // coarse edges at any child midpoint present in the selected vertex set.
 struct Key {int x,y,z; bool operator==(const Key&o)const{return x==o.x&&y==o.y&&z==o.z;}};
 struct Hash {size_t operator()(const Key&k)const{
   size_t h=uint32_t(k.x)*73856093u;
   h^=uint32_t(k.y)*19349663u;h^=uint32_t(k.z)*83492791u;return h;
 }};
 auto key=[](Vec v)->Key{return {(int)std::lround(v.x*10000000.),(int)std::lround(v.y*10000000.),(int)std::lround(v.z*10000000.)};};
 struct Segment {Vec a,b;float opacity;};
 std::vector<Segment> segments;
 std::unordered_map<Key,std::vector<Vec>,Hash> vertices;
 for(const Leaf &leaf:selectedLeaves){
   for(Vec v:{leaf.tri.a,leaf.tri.b,leaf.tri.c}) vertices[key(v)].push_back(v);
 }
 // An edge's spherical midpoint is shared with its finer neighbor.
 // Split it recursively only if that midpoint exists in selected leaves.
 std::unordered_map<Key,size_t,Hash> dedup;
 auto addSegment=[&](Vec a,Vec b,float alpha){
   Key ka=key(a),kb=key(b);
   // Pair endpoints in an order-independent 64-bit hash.
   Hash hash;size_t ha=hash(ka),hb=hash(kb);
   size_t id=(std::min(ha,hb)*1099511628211ull)^std::max(ha,hb);
   auto found=dedup.find(Key{(int)(id>>32),(int)id,0});
   if(found!=dedup.end()){segments[found->second].opacity=std::max(segments[found->second].opacity,alpha);return;}
   dedup[Key{(int)(id>>32),(int)id,0}]=segments.size();segments.push_back({a,b,alpha});
 };
 auto stitch=[&](auto&& self,Vec a,Vec b,float alpha,int depth)->void{
   if(depth<MAX_LOD){Vec mid=midpoint(a,b);
     if(vertices.find(key(mid))!=vertices.end()){
       self(self,a,mid,alpha,depth+1);self(self,mid,b,alpha,depth+1);return;
     }
   }
   addSegment(a,b,alpha);
 };
 for(const Leaf &leaf:selectedLeaves){
   stitch(stitch,leaf.tri.a,leaf.tri.b,leaf.alpha,0);
   stitch(stitch,leaf.tri.b,leaf.tri.c,leaf.alpha,0);
   stitch(stitch,leaf.tri.c,leaf.tri.a,leaf.alpha,0);
 }
 for(const auto &line:segments){edge(line.a,line.b,line.opacity);}
}

struct MeshVertex {float position[3];float normal[3];};
uint32_t read32(const uint8_t* p){uint32_t v;std::memcpy(&v,p,4);return v;}
std::string jsonArray(const std::string& s,const char* name){
 std::string label=std::string("\"")+name+"\"";
 size_t pos=s.find(label);if(pos==std::string::npos)return {};
 pos=s.find('[',pos+label.size());if(pos==std::string::npos)return {};
 size_t begin=pos++,depth=1;
 for(;pos<s.size();pos++){if(s[pos]=='[')depth++;else if(s[pos]==']'&&!--depth)return s.substr(begin+1,pos-begin-1);}
 return {};
}
std::vector<std::string> jsonObjects(const std::string& arr){
 std::vector<std::string> result;size_t first=0;int depth=0;
 for(size_t i=0;i<arr.size();i++){if(arr[i]=='{'){if(depth++==0)first=i;}
 else if(arr[i]=='}'&&--depth==0)result.push_back(arr.substr(first,i-first+1));}
 return result;
}
int jsonNumber(const std::string& obj,const char* name,int fallback=0){
 std::string key=std::string("\"")+name+"\"";
 size_t p=obj.find(key);if(p==std::string::npos)return fallback;
 p=obj.find(':',p+key.size());if(p==std::string::npos)return fallback;
 return std::atoi(obj.c_str()+p+1);
}
float jsonFloat(const std::string& obj,const char* name,float fallback){
 std::string key=std::string("\"")+name+"\"";
 size_t p=obj.find(key);if(p==std::string::npos)return fallback;
 p=obj.find(':',p+key.size());if(p==std::string::npos)return fallback;
 return std::strtof(obj.c_str()+p+1,nullptr);
}
bool loadPlayerGLB(AAssetManager* mgr){
 if(!mgr)return false;
 AAsset* asset=AAssetManager_open(mgr,"models/debug/player_capsule.glb",AASSET_MODE_BUFFER);
 if(!asset)return false;
 size_t size=(size_t)AAsset_getLength(asset);
 std::vector<uint8_t> bytes(size);
 int64_t copied=0;
 while(copied<(int64_t)size){
  int n=AAsset_read(asset,bytes.data()+copied,size-copied);
  if(n<=0)break;copied+=n;
 }
 AAsset_close(asset);
 if(copied!=(int64_t)size||size<28||read32(bytes.data())!=0x46546c67u||read32(bytes.data()+4)!=2u)return false;
 uint32_t jsonSize=read32(bytes.data()+12);
 if(read32(bytes.data()+16)!=0x4e4f534au||20ull+jsonSize+8>size)return false;
 std::string json((const char*)bytes.data()+20,jsonSize);
 size_t binHeader=20+jsonSize;
 uint32_t binSize=read32(bytes.data()+binHeader);
 if(read32(bytes.data()+binHeader+4)!=0x004e4942u||binHeader+8ull+binSize>size)return false;
 const uint8_t* bin=bytes.data()+binHeader+8;
 auto views=jsonObjects(jsonArray(json,"bufferViews"));
 auto accessors=jsonObjects(jsonArray(json,"accessors"));
 if(views.size()<3||accessors.size()<3)return false;
 auto getView=[&](int accessor,size_t elemBytes,int& count,const uint8_t*& ptr)->bool{
  if(accessor<0||accessor>=(int)accessors.size())return false;
  const std::string& a=accessors[accessor];
  int vi=jsonNumber(a,"bufferView",-1);if(vi<0||vi>=(int)views.size())return false;
  count=jsonNumber(a,"count",-1);int offset=jsonNumber(views[vi],"byteOffset")+jsonNumber(a,"byteOffset");
  int stride=jsonNumber(views[vi],"byteStride",(int)elemBytes);
  if(count<1||offset<0||stride!=(int)elemBytes||uint64_t(offset)+uint64_t(count)*elemBytes>binSize)return false;
  ptr=bin+offset;return true;
 };
 const uint8_t *pos=nullptr,*norm=nullptr,*idx=nullptr;
 int pc=0,nc=0,ic=0;
 if(!getView(0,12,pc,pos)||!getView(1,12,nc,norm)||!getView(2,2,ic,idx)||pc!=nc||pc>65535)return false;
 if(jsonNumber(accessors[0],"componentType")!=5126||jsonNumber(accessors[1],"componentType")!=5126||jsonNumber(accessors[2],"componentType")!=5123)return false;
 std::vector<MeshVertex> vertices(pc);
 for(int i=0;i<pc;i++){std::memcpy(vertices[i].position,pos+i*12,12);std::memcpy(vertices[i].normal,norm+i*12,12);}
 const std::string materials=jsonArray(json,"materials");
 size_t color=materials.find("\"baseColorFactor\"");
 if(color!=std::string::npos){size_t bracket=materials.find('[',color);if(bracket!=std::string::npos){
  const char* p=materials.c_str()+bracket+1;
  for(int i=0;i<4;i++){char* after=nullptr;meshGray[i]=std::strtof(p,&after);p=after;if(i<3){p=std::strchr(p,',');if(!p)break;p++;}}
 }}
 glGenVertexArrays(1,&meshVao);glBindVertexArray(meshVao);
 glGenBuffers(1,&meshVbo);glBindBuffer(GL_ARRAY_BUFFER,meshVbo);
 glBufferData(GL_ARRAY_BUFFER,vertices.size()*sizeof(MeshVertex),vertices.data(),GL_STATIC_DRAW);
 glGenBuffers(1,&meshIbo);glBindBuffer(GL_ELEMENT_ARRAY_BUFFER,meshIbo);
 glBufferData(GL_ELEMENT_ARRAY_BUFFER,ic*sizeof(uint16_t),idx,GL_STATIC_DRAW);
 glVertexAttribPointer(0,3,GL_FLOAT,GL_FALSE,sizeof(MeshVertex),(void*)0);glEnableVertexAttribArray(0);
 glVertexAttribPointer(1,3,GL_FLOAT,GL_FALSE,sizeof(MeshVertex),(void*)(3*sizeof(float)));glEnableVertexAttribArray(1);
 glBindVertexArray(0);meshIndexCount=ic;return true;
}

void rebuild(Vec eye){
 visibleLines.clear();selectedLeaves.clear();activeNodes=0;deepestLevel=0;
 frustumRejected=0;horizonRejected=0;visiblePatches=0;radiusRejected=0;lodStopped=0;
 float pixelScale=height/(2.f*std::tan(55.f*PI/360.f));
 for(const auto &tri:roots()){
  Vec center=normalize(add(add(tri.a,tri.b),tri.c));
  float radius=patchRadius(tri,center);
  if(!visible(tri,eye,center,radius))continue;
  traverse(tri,0,eye,pixelScale);
 }
 buildLeafEdges();
}
}

extern "C" JNIEXPORT void JNICALL Java_com_luckynate_quivermobile_MainActivity_nativeInit(JNIEnv* env,jobject,jobject androidAssets){
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

 const char* meshVS=R"(#version 300 es
 layout(location=0) in vec3 aPosition;
 layout(location=1) in vec3 aNormal;
 uniform mat4 uMVP;
 uniform vec3 uOrigin;
 uniform vec3 uEast;
 uniform vec3 uNorth;
 uniform vec3 uUp;
 uniform float uWorldScale;
 out vec3 normal;
 void main(){
   vec3 local=(aPosition.x*uEast+aPosition.y*uUp+aPosition.z*uNorth)*uWorldScale;
   gl_Position=uMVP*vec4(local,1.0);
   normal=normalize(aNormal.x*uEast+aNormal.y*uUp+aNormal.z*uNorth);
 }
 )";
 const char* meshFS=R"(#version 300 es
 precision mediump float;
 in vec3 normal;
 uniform vec4 uBaseColor;
 out vec4 color;
 void main(){
   float light=.32+.68*max(dot(normalize(normal),normalize(vec3(.3,.85,.4))),0.0);
   color=vec4(uBaseColor.rgb*light,uBaseColor.a);
 }
 )";
 GLuint mv=compile(GL_VERTEX_SHADER,meshVS),mf=compile(GL_FRAGMENT_SHADER,meshFS);
 meshProgram=glCreateProgram();glAttachShader(meshProgram,mv);glAttachShader(meshProgram,mf);
 glLinkProgram(meshProgram);glDeleteShader(mv);glDeleteShader(mf);
 bool loaded=loadPlayerGLB(AAssetManager_fromJava(env,androidAssets));
 __android_log_print(loaded?ANDROID_LOG_INFO:ANDROID_LOG_ERROR,"QuiverMobile",
  "Debug player GLB %s",loaded?"loaded":"FAILED TO LOAD");
 glEnable(GL_BLEND);glBlendFunc(GL_SRC_ALPHA,GL_ONE_MINUS_SRC_ALPHA);
 glDisable(GL_DEPTH_TEST);
 glClearColor(.035f,.045f,.075f,1.f);
 __android_log_print(ANDROID_LOG_INFO,"QuiverMobile","Reference sphere radius %.3f meters; root edge %.0f meters",SEA_LEVEL_RADIUS_METERS,ROOT_EDGE_METERS);
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
 if(length(movement)>.001f) position=normalize(add(position,scale(movement,5.f*dt/float(SEA_LEVEL_RADIUS_METERS))));
 up=position;east=tangentEast();north=tangentNorth();
 Vec cameraFacing=add(scale(north,std::cos(yaw)),scale(east,std::sin(yaw)));
 Vec eye=add(scale(up,1.f),scale(cameraFacing,-distance*std::cos(pitch)/float(SEA_LEVEL_RADIUS_METERS)));
 eye=add(eye,scale(up,(2.f+distance*std::sin(pitch))/float(SEA_LEVEL_RADIUS_METERS)));
 cameraForward=normalize(subtract(add(position,scale(up,.00001f)),eye));
 cameraRight=normalize(cross(cameraForward,up));
 cameraUp=cross(cameraRight,cameraForward);
 tanHalfVertical=std::tan(55.f*PI/360.f);
 tanHalfHorizontal=tanHalfVertical*float(width)/float(height);
 rebuild(eye);
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
 glClear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT);
 glUseProgram(program);
 glUniformMatrix4fv(glGetUniformLocation(program,"uMVP"),1,GL_FALSE,mvp);
 glUniform3f(glGetUniformLocation(program,"uOrigin"),position.x,position.y,position.z);
 glBindVertexArray(vao);
 glBindBuffer(GL_ARRAY_BUFFER,vbo);
 glBufferSubData(GL_ARRAY_BUFFER,0,visibleLines.size()*sizeof(LineVertex),visibleLines.data());
 glDrawArrays(GL_LINES,0,(GLsizei)visibleLines.size());
 if(meshIndexCount>0){
  glEnable(GL_DEPTH_TEST);glDepthFunc(GL_LEQUAL);
  glUseProgram(meshProgram);
  glUniformMatrix4fv(glGetUniformLocation(meshProgram,"uMVP"),1,GL_FALSE,mvp);
  glUniform3f(glGetUniformLocation(meshProgram,"uEast"),east.x,east.y,east.z);
  glUniform3f(glGetUniformLocation(meshProgram,"uNorth"),north.x,north.y,north.z);
  glUniform3f(glGetUniformLocation(meshProgram,"uUp"),up.x,up.y,up.z);
  glUniform1f(glGetUniformLocation(meshProgram,"uWorldScale"),1.f/float(SEA_LEVEL_RADIUS_METERS));
  glUniform4fv(glGetUniformLocation(meshProgram,"uBaseColor"),1,meshGray);
  glBindVertexArray(meshVao);glDrawElements(GL_TRIANGLES,meshIndexCount,GL_UNSIGNED_SHORT,nullptr);
  glDisable(GL_DEPTH_TEST);
 }
}
extern "C" JNIEXPORT void JNICALL Java_com_luckynate_quivermobile_MainActivity_nativeOrbit(JNIEnv*,jobject,jfloat dx,jfloat dy,jfloat zoom){
 yaw+=dx;pitch=std::clamp(pitch+dy,-.1f,1.45f);
 distance=std::clamp(distance*zoom,3.f,600000.f);
}

extern "C" JNIEXPORT jstring JNICALL Java_com_luckynate_quivermobile_MainActivity_nativeDiagnostics(JNIEnv* env,jobject){
 char output[320];
 std::snprintf(output,sizeof(output),
   "NATIVE LOD-DIAG-1 | R %.2fm | edge %.0fm\\n"
   "depth %d / %d | split %d | lines %zu\\n"
   "visible %d | frustum %d | horizon %d\\n"
   "radius stop %d | LOD stop %d | zoom %.1fm",
   SEA_LEVEL_RADIUS_METERS,ROOT_EDGE_METERS,
   deepestLevel,MAX_LOD,activeNodes,visibleLines.size()/2,
   visiblePatches,frustumRejected,horizonRejected,
   radiusRejected,lodStopped,distance);
 return env->NewStringUTF(output);
}
