import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export async function createMarket(onSelect,onOffice) {
  const host=document.querySelector('#scene');
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.15;host.append(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#6a7953');
  const camera=new THREE.OrthographicCamera(-34,34,27,-27,.1,400);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableRotate=false;controls.enableDamping=true;controls.screenSpacePanning=false;
  controls.minZoom=.45;controls.maxZoom=3;controls.mouseButtons.LEFT=THREE.MOUSE.PAN;
  controls.touches.ONE=THREE.TOUCH.PAN;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
  scene.add(new THREE.HemisphereLight(0xe9f3ff,0x454829,2.0));
  const sun=new THREE.DirectionalLight(0xffedcc,3.0);sun.position.set(-28,48,24);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-50,right:50,top:65,bottom:-65,near:1,far:180});
  sun.shadow.bias=-.0003;sun.shadow.normalBias=.035;scene.add(sun);scene.add(sun.target);
  const loader=new GLTFLoader();
  const [market,sedan,suv,hatchback,slots,names]=await Promise.all([
    loader.loadAsync('/assets/models/market.glb'),loader.loadAsync('/assets/models/sedan.glb'),
    loader.loadAsync('/assets/models/suv.glb'),loader.loadAsync('/assets/models/hatchback.glb'),
    fetch('/assets/models/slots.json').then(r=>{if(!r.ok)throw Error('slots');return r.json();}),
    loader.loadAsync('/assets/models/office-names.glb')]);
  names.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  scene.add(names.scene);
  const noise=document.createElement('canvas');noise.width=noise.height=256;
  const ctx=noise.getContext('2d'),pixels=ctx.createImageData(256,256);let seed=41;
  for(let i=0;i<pixels.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const v=110+(seed>>>24)%45;
    pixels.data[i]=v;pixels.data[i+1]=v;pixels.data[i+2]=v;pixels.data[i+3]=255;}
  ctx.putImageData(pixels,0,0);const asphaltTexture=new THREE.CanvasTexture(noise);
  asphaltTexture.wrapS=asphaltTexture.wrapT=THREE.RepeatWrapping;asphaltTexture.repeat.set(20,40);
  market.scene.traverse(o=>{if(o.isMesh){o.receiveShadow=true;o.castShadow=true;
    if(o.material.name==='Asphalt'){o.material.color.set('#85847b');o.material.map=asphaltTexture;o.material.roughness=1;}
    if(o.material.name==='Grass')o.material.color.set('#526430');
  }});scene.add(market.scene);
  const templates={sedan:sedan.scene,suv:suv.scene,hatchback:hatchback.scene};
  const colors={black:'#141b20',white:'#edf0e9',silver:'#a5afb1',red:'#a81721',blue:'#175bc0',green:'#23734b',yellow:'#ffc229',purple:'#713bae'};
  const models=new Map();const carLayer=new THREE.Group();scene.add(carLayer);
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
  renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,time:Date.now()};});
  renderer.domElement.addEventListener('pointerup',e=>{
    if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>8||Date.now()-down.time>550)return;
    const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    const hits=raycaster.intersectObjects(carLayer.children,true);
    if(hits.length){let o=hits[0].object;while(o&&!o.userData.listingId)o=o.parent;if(o)onSelect(o.userData.listingId);return;}
    const plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),point=new THREE.Vector3();
    raycaster.ray.intersectPlane(plane,point);if(Math.abs(point.x)<7&&point.z>-20&&point.z<-8)onOffice();
  });
  function reset(z=5) {camera.position.set(0,54,z+56);controls.target.set(0,0,z);camera.zoom=1;camera.updateProjectionMatrix();controls.update();}
  function resize() {
    const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);
    const height=w<700?90:Math.max(57,73*h/w);const width=height*w/h;
    camera.left=-width/2;camera.right=width/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();
  }
  reset();resize();window.addEventListener('resize',resize);
  function pan(dx,dz) {const v=new THREE.Vector3(dx,0,dz);camera.position.add(v);controls.target.add(v);controls.update();}
  const buttons=document.querySelectorAll('[data-pan]');let movement=null;
  buttons.forEach(b=>{
    b.addEventListener('pointerdown',e=>{b.setPointerCapture(e.pointerId);movement={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]}[b.dataset.pan];});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,()=>movement=null);
  });
  window.addEventListener('blur',()=>movement=null);
  const keys={ArrowUp:[0,-3],ArrowDown:[0,3],ArrowLeft:[-3,0],ArrowRight:[3,0],w:[0,-3],s:[0,3],a:[-3,0],d:[3,0]};
  window.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]')||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(keys[e.key]){e.preventDefault();pan(...keys[e.key]);}});
  function zoom(v){camera.zoom=THREE.MathUtils.clamp(camera.zoom*v,.45,3);camera.updateProjectionMatrix();}
  document.querySelector('#zoomIn').onclick=()=>zoom(1.2);document.querySelector('#zoomOut').onclick=()=>zoom(1/1.2);
  document.querySelector('#resetCamera').onclick=()=>reset();let area=0;
  document.querySelector('#nextArea').onclick=()=>{area=(area+1)%4;reset([5,-36,-66,-96][area]);};
  let last=performance.now();
  renderer.setAnimationLoop(now=>{
    const dt=Math.min((now-last)/1000,.05);last=now;
    if(document.hidden)return;
    if(movement&&!document.querySelector('dialog[open]'))pan(movement[0]*dt*20,movement[1]*dt*20);
    controls.update();
    const target=controls.target.clone();controls.target.x=THREE.MathUtils.clamp(target.x,-32,32);controls.target.z=THREE.MathUtils.clamp(target.z,-108,26);
    camera.position.add(controls.target.clone().sub(target));
    sun.target.position.copy(controls.target);sun.position.copy(controls.target).add(new THREE.Vector3(-28,48,24));
    document.querySelector('#mapArea').textContent=controls.target.z>-21?'Центральна площадка · 1–30':controls.target.z>-51?'Північна площадка · 31–50':controls.target.z>-81?'Північна площадка · 51–80':'Північна площадка · 81–100';
    renderer.render(scene,camera);
  });
  return {
    update(listings){
      const ids=new Set(listings.map(l=>l.id));
      for(const [id,o] of models)if(!ids.has(id)){carLayer.remove(o);o.traverse(m=>{if(m.userData.ownMaterial)m.material.dispose();});models.delete(id);}
      for(const l of listings){
        if(models.has(l.id))continue;const slot=slots.find(s=>s.id===l.slotId);if(!slot)continue;
        const model=(templates[l.bodyType]||templates.sedan).clone(true);model.userData.listingId=l.id;
        model.position.set(slot.x,.05,slot.z);model.scale.setScalar(1.25);
        model.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;
          if(m.material.name.startsWith('BodyPaint')){m.material=m.material.clone();m.material.color.set(colors[l.color]||colors.black);m.userData.ownMaterial=true;}}});
        models.set(l.id,model);carLayer.add(model);
      }
    }, focus(id){const o=models.get(id);if(o){reset(o.position.z);pan(o.position.x,0);camera.zoom=1.8;camera.updateProjectionMatrix();}},
    setQuality(high){renderer.shadowMap.enabled=high;renderer.setPixelRatio(high?Math.min(devicePixelRatio,1.5):1);resize();},
    reset
  };
}
