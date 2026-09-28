import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export async function createMarket(onSelect,onOffice) {
  const host=document.querySelector('#scene');
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;host.append(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#74815f');
  // Outdoor sky and horizon reflections, generated locally without texture downloads.
  const sky=document.createElement('canvas');sky.width=512;sky.height=256;
  const skyContext=sky.getContext('2d'),gradient=skyContext.createLinearGradient(0,0,0,256);
  for(const [stop,color] of [[0,'#638aae'],[.46,'#dce9e8'],[.52,'#8b957b'],[1,'#414b37']])gradient.addColorStop(stop,color);
  skyContext.fillStyle=gradient;skyContext.fillRect(0,0,512,256);
  const skyTexture=new THREE.CanvasTexture(sky);skyTexture.mapping=THREE.EquirectangularReflectionMapping;
  skyTexture.colorSpace=THREE.SRGBColorSpace;
  const pmrem=new THREE.PMREMGenerator(renderer);
  scene.environment=pmrem.fromEquirectangular(skyTexture).texture;skyTexture.dispose();pmrem.dispose();scene.environmentIntensity=.8;
  const camera=new THREE.OrthographicCamera(-30,30,30,-30,.1,400);
  const cameraOffset=new THREE.Vector3(0,44,72);
  const homeTarget=new THREE.Vector3(0,0,-5);
  const isCompactView=()=>host.clientWidth<=700;
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableRotate=false;controls.enableDamping=true;controls.screenSpacePanning=false;
  controls.dampingFactor=.1;controls.minZoom=1;controls.maxZoom=3.2;controls.mouseButtons.LEFT=THREE.MOUSE.PAN;
  controls.touches.ONE=THREE.TOUCH.PAN;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
  scene.add(new THREE.HemisphereLight(0xddeaff,0x4e4836,1.1));
  const sun=new THREE.DirectionalLight(0xffe7c1,2.6);sun.position.set(-40,60,35);sun.target.position.set(0,0,-7);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-65,right:65,top:65,bottom:-65,near:1,far:180});
  sun.shadow.bias=-.0003;sun.shadow.normalBias=.035;scene.add(sun);scene.add(sun.target);
  const loader=new GLTFLoader();
  const [market,sedan,suv,hatchback,slots,names]=await Promise.all([
    loader.loadAsync('/assets/models/market.glb'),loader.loadAsync('/assets/models/sedan.glb'),
    loader.loadAsync('/assets/models/suv.glb'),loader.loadAsync('/assets/models/hatchback.glb'),
    fetch('/assets/models/slots.json').then(r=>{if(!r.ok)throw Error('slots');return r.json();}),
    loader.loadAsync('/assets/models/office-names.glb')]);
  names.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  scene.add(names.scene);
  const noise=document.createElement('canvas');noise.width=noise.height=512;
  const ctx=noise.getContext('2d'),pixels=ctx.createImageData(512,512);let seed=41;
  for(let i=0;i<pixels.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const v=130+(seed>>>24)%65;
    pixels.data[i]=v;pixels.data[i+1]=v;pixels.data[i+2]=v;pixels.data[i+3]=255;}
  ctx.putImageData(pixels,0,0);const asphaltTexture=new THREE.CanvasTexture(noise);
  asphaltTexture.wrapS=asphaltTexture.wrapT=THREE.RepeatWrapping;asphaltTexture.colorSpace=THREE.SRGBColorSpace;
  asphaltTexture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
  market.scene.updateMatrixWorld(true);
  market.scene.traverse(o=>{if(o.isMesh){o.receiveShadow=true;o.castShadow=true;
    if(o.material.name==='Asphalt'){
      const positions=o.geometry.attributes.position,uv=new Float32Array(positions.count*2),point=new THREE.Vector3();
      for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld);uv[i*2]=point.x/6;uv[i*2+1]=point.z/6;}
      o.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
      o.material.color.set('#666963');o.material.map=asphaltTexture;o.material.bumpMap=asphaltTexture;o.material.bumpScale=.035;o.material.roughness=.94;
    }
    if(o.material.name==='Grass')o.material.color.set('#536544');
  }});scene.add(market.scene);
  const templates={sedan:sedan.scene,suv:suv.scene,hatchback:hatchback.scene};
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;
  const shadowContext=shadowCanvas.getContext('2d'),contact=shadowContext.createRadialGradient(32,32,8,32,32,32);
  contact.addColorStop(0,'rgba(0,0,0,.48)');contact.addColorStop(.65,'rgba(0,0,0,.22)');contact.addColorStop(1,'rgba(0,0,0,0)');
  shadowContext.fillStyle=contact;shadowContext.fillRect(0,0,64,64);
  const contactMaterial=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false});
  const contactGeometry=new THREE.PlaneGeometry(2.7,5.4);
  const colors={black:'#141b20',white:'#edf0e9',silver:'#a5afb1',red:'#a81721',blue:'#175bc0',green:'#23734b',yellow:'#ffc229',purple:'#713bae'};
  let selected=null;const metadata=new Map();
  const marker=document.createElement('button');marker.className='price-marker';marker.hidden=true;host.append(marker);
  marker.onclick=()=>{if(selected)onSelect(selected);};
  const outline=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-1.7,.09,-3.15),new THREE.Vector3(1.7,.09,-3.15),new THREE.Vector3(1.7,.09,3.15),new THREE.Vector3(-1.7,.09,3.15)
  ]),new THREE.LineBasicMaterial({color:0x67ffac}));outline.visible=false;scene.add(outline);
  const selectedFloor=new THREE.Mesh(new THREE.PlaneGeometry(3.4,6.3),new THREE.MeshBasicMaterial({color:0x36ef96,transparent:true,opacity:.22,depthWrite:false}));
  selectedFloor.rotation.x=-Math.PI/2;outline.add(selectedFloor);selectedFloor.position.y=.08;
  function select(id){selected=id;const o=models.get(id),l=metadata.get(id);outline.visible=!!o;marker.hidden=!o;
    if(o&&l){outline.position.copy(o.position);marker.textContent='$ '+Number(l.price).toLocaleString('uk-UA')+' · Деталі';}}
  const models=new Map();const carLayer=new THREE.Group();scene.add(carLayer);
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
  renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,time:Date.now()};});
  renderer.domElement.addEventListener('pointerup',e=>{
    if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>8||Date.now()-down.time>550)return;
    const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    const hits=raycaster.intersectObjects(carLayer.children,true);
    if(hits.length){let o=hits[0].object;while(o&&!o.userData.listingId)o=o.parent;if(o){select(o.userData.listingId);onSelect(o.userData.listingId);}return;}
    const plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),point=new THREE.Vector3();
    raycaster.ray.intersectPlane(plane,point);if(Math.abs(point.x)<7&&point.z>-20&&point.z<-8)onOffice();
  });
  let cameraMove=null;
  function setView(x,z,zoom=1,immediate=false) {
    zoom=THREE.MathUtils.clamp(zoom,controls.minZoom,controls.maxZoom);
    const target=new THREE.Vector3(x,0,z),position=target.clone().add(cameraOffset);
    if(immediate){controls.target.copy(target);camera.position.copy(position);camera.zoom=zoom;camera.updateProjectionMatrix();controls.update();return;}
    cameraMove={started:performance.now(),duration:420,fromTarget:controls.target.clone(),toTarget:target,
      fromPosition:camera.position.clone(),toPosition:position,fromZoom:camera.zoom,toZoom:zoom};
  }
  function reset(z=isCompactView()?-12:homeTarget.z,immediate=false) {setView(homeTarget.x,z,1,immediate);}
  function resize() {
    const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);
    const aspect=w/Math.max(h,1);
    // Mobile starts closer to the active bays; zooming out still reveals the full lot.
    const viewWidth=isCompactView()?52:76;
    const height=viewWidth/aspect;
    camera.left=-viewWidth/2;camera.right=viewWidth/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();
    controls.minZoom=isCompactView()?.68:1;
    camera.zoom=THREE.MathUtils.clamp(camera.zoom,controls.minZoom,controls.maxZoom);camera.updateProjectionMatrix();
  }
  resize();reset(undefined,true);window.addEventListener('resize',resize);
  controls.addEventListener('start',()=>cameraMove=null);
  function pan(dx,dz) {cameraMove=null;const v=new THREE.Vector3(dx,0,dz);camera.position.add(v);controls.target.add(v);controls.update();}
  const buttons=document.querySelectorAll('[data-pan]');let movement=null;
  buttons.forEach(b=>{
    b.addEventListener('pointerdown',e=>{b.setPointerCapture(e.pointerId);movement={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]}[b.dataset.pan];});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,()=>movement=null);
  });
  window.addEventListener('blur',()=>movement=null);
  const keys={ArrowUp:[0,-3],ArrowDown:[0,3],ArrowLeft:[-3,0],ArrowRight:[3,0],w:[0,-3],s:[0,3],a:[-3,0],d:[3,0]};
  window.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]')||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(keys[e.key]){e.preventDefault();pan(...keys[e.key]);}});
  function zoom(v){cameraMove=null;camera.zoom=THREE.MathUtils.clamp(camera.zoom*v,controls.minZoom,controls.maxZoom);camera.updateProjectionMatrix();}
  document.querySelector('#zoomIn').onclick=()=>zoom(1.2);document.querySelector('#zoomOut').onclick=()=>zoom(1/1.2);
  document.querySelector('#resetCamera').onclick=()=>{area=0;select(null);reset();};let area=0;
  document.querySelector('#nextArea').onclick=()=>{reset();};
  let last=performance.now();
  renderer.setAnimationLoop(now=>{
    const dt=Math.min((now-last)/1000,.05);last=now;
    if(document.hidden)return;
    if(cameraMove){const progress=Math.min(1,(now-cameraMove.started)/cameraMove.duration),ease=1-Math.pow(1-progress,3);
      controls.target.lerpVectors(cameraMove.fromTarget,cameraMove.toTarget,ease);
      camera.position.lerpVectors(cameraMove.fromPosition,cameraMove.toPosition,ease);
      camera.zoom=THREE.MathUtils.lerp(cameraMove.fromZoom,cameraMove.toZoom,ease);camera.updateProjectionMatrix();
      if(progress===1)cameraMove=null;
    }
    if(movement&&!document.querySelector('dialog[open]'))pan(movement[0]*dt*20/camera.zoom,movement[1]*dt*20/camera.zoom);
    controls.update();
    const target=controls.target.clone(),horizontalLimit=38-38/camera.zoom;
    controls.target.x=THREE.MathUtils.clamp(target.x,-horizontalLimit,horizontalLimit);controls.target.z=THREE.MathUtils.clamp(target.z,-37,25);
    camera.position.add(controls.target.clone().sub(target));
    document.querySelector('#mapArea').textContent='Центральна площадка · 1–30';
    if(selected&&models.has(selected)){
      const p=models.get(selected).position.clone().add(new THREE.Vector3(0,3.5,0)).project(camera);
      marker.hidden=Math.abs(p.x)>.94||Math.abs(p.y)>.9||!!document.querySelector('dialog[open]');
      const rawLeft=(p.x+1)*host.clientWidth/2,markerHalf=Math.min(marker.offsetWidth/2,host.clientWidth/2-12);
      marker.style.left=THREE.MathUtils.clamp(rawLeft,markerHalf+12,host.clientWidth-markerHalf-12)+'px';
      marker.style.top=((-p.y+1)*host.clientHeight/2)+'px';
    }
    renderer.render(scene,camera);
  });
  return {
    select,
    update(listings){
      metadata.clear();listings.forEach(l=>metadata.set(l.id,l));
      const ids=new Set(listings.map(l=>l.id));
      for(const [id,o] of models)if(!ids.has(id)){carLayer.remove(o);o.traverse(m=>{if(m.userData.ownMaterial)m.material.dispose();});models.delete(id);if(selected===id)select(null);}
      for(const l of listings){
        const slot=slots.find(s=>s.id===l.slotId);if(!slot)continue;
        if(models.has(l.id)){models.get(l.id).position.set(slot.x,.05,slot.z);continue;}
        const model=(templates[l.bodyType]||templates.sedan).clone(true);model.userData.listingId=l.id;
        model.position.set(slot.x,.05,slot.z);model.scale.setScalar(1.25);
        model.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;
          if(m.material.name.startsWith('BodyPaint')){
            const original=m.material;m.material=new THREE.MeshPhysicalMaterial({color:colors[l.color]||colors.black,
              metalness:.65,roughness:.25,clearcoat:1,clearcoatRoughness:.16,envMapIntensity:1.15});
            m.material.name=original.name;m.userData.ownMaterial=true;
          }}});
        const contactShadow=new THREE.Mesh(contactGeometry,contactMaterial);contactShadow.rotation.x=-Math.PI/2;
        contactShadow.position.y=.015;model.add(contactShadow);
        models.set(l.id,model);carLayer.add(model);
      }
    }, focus(id){select(id);const o=models.get(id);if(o)setView(o.position.x,o.position.z,1.7);},
    setQuality(high){renderer.shadowMap.enabled=high;renderer.setPixelRatio(high?Math.min(devicePixelRatio,1.5):1);resize();},
    reset
  };
}

