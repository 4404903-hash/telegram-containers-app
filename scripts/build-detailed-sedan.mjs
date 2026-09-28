import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

// Node does not expose FileReader, which GLTFExporter uses for its final Blob.
globalThis.FileReader=class {
  readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}
  readAsDataURL(blob){blob.arrayBuffer().then(buffer=>{
    this.result=`data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;this.onloadend?.();
  });}
};

const root=path.resolve(import.meta.dirname,'..');
const output=path.join(root,'public','assets','models','sedan.glb');
const car=new THREE.Group();car.name='Detailed generic sedan';

const physical=(name,color,metalness,roughness,extra={})=>new THREE.MeshPhysicalMaterial({
  name,color,metalness,roughness,...extra
});
const paint=physical('BodyPaint',0xd61f2b,.38,.23,{clearcoat:1,clearcoatRoughness:.12});
const paintDetail=physical('BodyPaint details',0xd61f2b,.38,.23,{clearcoat:1,clearcoatRoughness:.12});
paint.side=paintDetail.side=THREE.DoubleSide;
const rubber=physical('Rubber',0x111317,0,.86);
const trim=physical('Black trim',0x15191c,.22,.38);
const glass=physical('Automotive glass',0x102a38,.18,.16,{transparent:true,opacity:.96,transmission:0,thickness:.035});
glass.side=THREE.DoubleSide;
const chrome=physical('Alloy',0xaeb7bc,.92,.2);
const brake=physical('Brake steel',0x6b7072,.82,.35);
const headlight=physical('Headlight lens',0xe8f4f8,.18,.08,{transparent:true,opacity:.9,transmission:.08});
const reflector=physical('Headlight reflector',0xdde5df,.95,.12);
const tail=physical('Tail lamp lens',0xa9000b,.25,.16,{transparent:true,opacity:.92});
const indicator=physical('Indicator lens',0xe36a09,.2,.18,{transparent:true,opacity:.9});
const interior=physical('Interior fabric',0x24282d,0,.9);
const plate=physical('Number plate',0xe8ebea,.1,.5);

function mesh(geometry,material,name,position=[0,0,0],rotation=[0,0,0],scale=[1,1,1]){
  const object=new THREE.Mesh(geometry,material);object.name=name;object.position.set(...position);
  object.rotation.set(...rotation);object.scale.set(...scale);object.castShadow=true;object.receiveShadow=true;car.add(object);return object;
}
function box(name,size,position,material=trim,rotation=[0,0,0],radius=.035){
  const safeRadius=Math.min(radius,Math.min(...size)*.38);
  const geometry=safeRadius>0?new RoundedBoxGeometry(...size,1,safeRadius):new THREE.BoxGeometry(...size);
  return mesh(geometry,material,name,position,rotation);
}
function shellGeometry(){
  const sections=[
    {z:-2.31,w:.71,y:.25,h:.55},{z:-2.15,w:.86,y:.24,h:.66},{z:-1.62,w:.93,y:.22,h:.72},
    {z:.98,w:.93,y:.22,h:.75},{z:1.68,w:.89,y:.23,h:.67},{z:2.18,w:.80,y:.25,h:.58},{z:2.31,w:.66,y:.29,h:.47}
  ];
  const profile=[[-.72,0],[-.94,.10],[-1,.31],[-.96,.58],[-.78,.84],[-.48,1],[.48,1],[.78,.84],[.96,.58],[1,.31],[.94,.10],[.72,0]];
  const vertices=[],indices=[];
  for(const section of sections)for(const [x,y] of profile)vertices.push(x*section.w,section.y+y*section.h,section.z);
  const count=profile.length;
  for(let row=0;row<sections.length-1;row++)for(let column=0;column<count;column++){
    const a=row*count+column,b=row*count+(column+1)%count,c=(row+1)*count+(column+1)%count,d=(row+1)*count+column;
    indices.push(a,b,d,b,c,d);
  }
  for(const row of [0,sections.length-1]){
    const center=vertices.length/3,section=sections[row];vertices.push(0,section.y+section.h*.46,section.z);
    for(let column=0;column<count;column++){
      const a=row*count+column,b=row*count+(column+1)%count;
      indices.push(center,row===0?b:a,row===0?a:b);
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
mesh(shellGeometry(),paint,'BodyPaint sculpted shell');

// Glazed cabin: a tapered greenhouse with separate painted roof and pillars.
function prism(name,lower,upper,material){
  const vertices=[[-lower.w,lower.y,lower.rear],[lower.w,lower.y,lower.rear],[lower.w,lower.y,lower.front],[-lower.w,lower.y,lower.front],
    [-upper.w,upper.y,upper.rear],[upper.w,upper.y,upper.rear],[upper.w,upper.y,upper.front],[-upper.w,upper.y,upper.front]];
  const faces=[0,3,2,0,2,1,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices.flat(),3));geometry.setIndex(faces);geometry.computeVertexNormals();
  return mesh(geometry,material,name);
}
prism('Reflective glazed cabin',{w:.82,y:.86,rear:-1.36,front:1.05},{w:.63,y:1.48,rear:-.78,front:.47},glass);
box('BodyPaint roof',[1.28,.09,1.28],[0,1.5,-.14],paintDetail);
for(const side of [-1,1]){
  box('BodyPaint A pillar',[.065,.64,.08],[side*.735,1.18,.75],paintDetail,[Math.PI*.16,0,side*Math.PI*.02]);
  box('BodyPaint B pillar',[.07,.57,.095],[side*.79,1.16,-.22],paintDetail);
  box('BodyPaint C pillar',[.08,.63,.09],[side*.72,1.18,-1.05],paintDetail,[-Math.PI*.18,0,0]);
  box('BodyPaint mirror',[.25,.16,.31],[side*1.01,1.02,.66],paintDetail,[0,0,side*.08]);
  box('Mirror glass',[.012,.11,.21],[side*1.138,1.025,.62],glass);
  box('Lower sill trim',[.045,.11,2.8],[side*.925,.38,-.05],trim);
  box('Side protection strip',[.028,.085,2.95],[side*.942,.63,-.10],trim);
  for(const z of [-.86,.33])box('Door handle',[.035,.055,.24],[side*.951,.86,z],chrome);
  box('Front door seam',[.018,.49,.018],[side*.947,.65,.38],trim);
  box('Rear door seam',[.018,.49,.018],[side*.947,.65,-.68],trim);
  box('Door belt seal',[.025,.025,2.42],[side*.895,.92,-.14],rubber);
}

// Hood, trunk and panel gaps make the surfaces read at close camera distances.
for(const x of [-.72,.72])box('Hood character line',[.018,.012,1.08],[x,.93,1.52],trim,[0,x*.012,0]);
box('Hood rear seam',[1.58,.012,.018],[0,.925,.96],trim);
box('Trunk seam',[1.48,.012,.018],[0,.88,-1.79],trim);
box('Front bumper',[1.72,.18,.16],[0,.43,2.29],trim);
box('Rear bumper',[1.72,.18,.16],[0,.45,-2.28],trim);
box('Front lower intake',[1.03,.15,.045],[0,.36,2.385],rubber);
for(const y of [.54,.59,.64,.69])box('Grille slat',[.78,.018,.035],[0,y,2.367],chrome);
for(const x of [-.56,.56]){
  box('Headlight reflector',[.39,.18,.055],[x,.67,2.325],reflector);
  box('Headlight clear lens',[.42,.20,.065],[x,.67,2.365],headlight);
  box('Front indicator',[.16,.17,.07],[x>0?.81:-.81,.63,2.34],indicator);
  box('Tail light',[.43,.20,.07],[x,.68,-2.33],tail);
  box('Fog light',[.25,.10,.05],[x*.88,.37,2.405],headlight);
}
box('Front plate',[.48,.13,.025],[0,.48,2.395],plate);
box('Rear plate',[.48,.13,.025],[0,.56,-2.375],plate);

// Interior remains visible through the transparent glass.
box('Dashboard',[1.38,.18,.42],[0,.92,.59],interior,[.08,0,0]);
for(const x of [-.48,.48])for(const z of [-.63,.35]){
  box('Seat cushion',[.44,.18,.46],[x,.66,z],interior);
  box('Seat back',[.44,.60,.16],[x,.94,z-.16],interior,[-.08,0,0]);
  box('Headrest',[.25,.20,.12],[x,1.29,z-.20],interior);
}
const steering=mesh(new THREE.TorusGeometry(.17,.025,8,24),trim,'Steering wheel',[-.45,1.02,.54],[Math.PI/2,0,0]);
box('Rear parcel shelf',[1.27,.07,.43],[0,.90,-1.12],interior);

// Wipers rest above the cowl and remain visible in the game's elevated view.
box('Left windscreen wiper',[.035,.018,.52],[-.28,1.04,.82],rubber,[0,.36,-.18]);
box('Right windscreen wiper',[.035,.018,.48],[.28,1.04,.82],rubber,[0,-.32,.18]);

function wheel(side,z){
  const x=side*.91;
  mesh(new THREE.CylinderGeometry(.365,.365,.245,32,2),rubber,'Tire',[x,.37,z],[0,0,Math.PI/2]);
  mesh(new THREE.CylinderGeometry(.235,.235,.252,32),chrome,'Alloy rim',[x+side*.008,.37,z],[0,0,Math.PI/2]);
  mesh(new THREE.CylinderGeometry(.18,.18,.258,32),brake,'Brake disc',[x+side*.013,.37,z],[0,0,Math.PI/2]);
  mesh(new THREE.CylinderGeometry(.065,.065,.266,24),trim,'Wheel hub',[x+side*.018,.37,z],[0,0,Math.PI/2]);
  for(let index=0;index<5;index++){
    const angle=index*Math.PI*2/5;
    const spoke=box('Alloy spoke',[.028,.055,.29],[x+side*.145,.37+Math.cos(angle)*.105,z+Math.sin(angle)*.105],chrome,[angle,0,Math.PI/2]);
    spoke.rotation.x=angle;
  }
  box('Brake caliper',[.035,.12,.065],[x+side*.16,.43,z-.12],indicator);
}
for(const side of [-1,1])for(const z of [-1.43,1.43])wheel(side,z);

car.rotation.y=Math.PI;
car.traverse(object=>{if(object.isMesh){object.geometry.computeBoundingBox();object.geometry.computeBoundingSphere();}});
const scene=new THREE.Scene();scene.name='Detailed sedan asset';scene.add(car);
const exporter=new GLTFExporter();
const binary=await exporter.parseAsync(scene,{binary:true,onlyVisible:true,trs:false,maxTextureSize:1024});
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,Buffer.from(binary));
console.log(`Wrote ${output} (${binary.byteLength} bytes)`);
