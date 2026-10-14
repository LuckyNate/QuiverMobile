import * as THREE from 'three';

// Shared GPU billboard batch. Each square is two triangles, independently animated
// from stable per-instance seeds; CPU work per frame is one time-uniform update.
export class BillboardParticles {
 constructor({count,size,palette,height,radius,embers=false}){
  this.count=count;
  const geometry=new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1,1));
  geometry.instanceCount=count;
  const seeds=new Float32Array(count*4),colors=new Float32Array(count*3);
  const hash=n=>{
   let x=Math.imul(n^0x9e3779b9,0x85ebca6b);
   x=Math.imul(x^(x>>>13),0xc2b2ae35);
   return ((x^(x>>>16))>>>0)/4294967296;
  };
  for(let i=0;i<count;i++){
   seeds[i*4]=hash(i*3+19)*Math.PI*2;     // angular position
   seeds[i*4+1]=Math.sqrt(hash(i*7+31));  // radial distribution
   seeds[i*4+2]=hash(i*11+47);           // lifetime offset
   seeds[i*4+3]=hash(i+count*7);         // turbulence phase
   const c=new THREE.Color(palette[Math.floor(hash(i*13+97)*palette.length)]);
   c.toArray(colors,i*3);
  }
  geometry.setAttribute('aParticle',new THREE.InstancedBufferAttribute(seeds,4));
  geometry.setAttribute('aColor',new THREE.InstancedBufferAttribute(colors,3));
  const material=new THREE.ShaderMaterial({
   uniforms:{
    uTime:{value:0},uSize:{value:size},uHeight:{value:height},
    uRadius:{value:radius},uEmbers:{value:embers?1:0}
   },
   vertexShader:`
    attribute vec4 aParticle;
    attribute vec3 aColor;
    uniform float uTime,uSize,uHeight,uRadius,uEmbers;
    varying vec3 vColor;
    void main(){
     vColor=aColor;
     float phase=fract(uTime*mix(.68,.27,uEmbers)+aParticle.z);
     float y=mix(.22+uHeight*phase,uHeight*(.7+phase*1.05),uEmbers);
     float taper=pow(max(0.0,1.0-phase),.8);
     float spread=mix(.12+.88*taper,.72,uEmbers);
     float radius=uRadius*aParticle.y*spread;
     float wave=sin(uTime*1.7+aParticle.w*12.0+phase*8.0)*.16+
                sin(uTime*.83+y*2.1)*.11;
     vec3 center=vec3(cos(aParticle.x)*radius+wave,y,
       sin(aParticle.x)*radius+cos(uTime*1.27+aParticle.w*9.0+phase*6.0)*.17);
     float pulse=.8+.35*sin(uTime*8.0+aParticle.w*31.0);
     float fade=mix(.3+.7*sin(3.14159265*pow(phase,.7)),
       .45+.55*(1.0-phase),uEmbers);
     float scale=max(.08,pulse*fade)*uSize;
     // Billboard corners are displaced in camera coordinates, not local XYZ.
     // Plane winding faces the camera; DoubleSide makes culling independent.
     vec4 eye=modelViewMatrix*vec4(center,1.0);
     eye.xy+=position.xy*scale;
     gl_Position=projectionMatrix*eye;
    }
   `,
   fragmentShader:`
    varying vec3 vColor;
    void main(){
     gl_FragColor=vec4(vColor,1.0);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }
   `,
   side:THREE.DoubleSide,depthTest:true,depthWrite:true,
   transparent:false
  });
  this.mesh=new THREE.Mesh(geometry,material);
  this.mesh.frustumCulled=false; // particles travel above their origin
  this.material=material;
 }
 update(time){this.material.uniforms.uTime.value=time;}
 dispose(){this.mesh.geometry.dispose();this.material.dispose();}
}
