"""Blender 4.5: blender --background --python blender/build_assets.py -- --output public/assets/models"""
import bpy, math, os, sys, json, random
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
ROOT=os.path.abspath(args[args.index('--output')+1] if '--output' in args else 'public/assets/models')
os.makedirs(ROOT,exist_ok=True)
SRC=os.path.join(ROOT,'blend');os.makedirs(SRC,exist_ok=True)
random.seed(12)

def mat(name,color,metal=0,rough=.5):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m

def coord(x,y,z):return (x,-z,y)
cube_cache={}
def box(name,pos,size,material,bevel=0):
    if not bevel:
        key=material.name
        if key not in cube_cache:
            mesh=bpy.data.meshes.new('Unit cube '+key)
            mesh.from_pydata([(-.5,-.5,-.5),(.5,-.5,-.5),(.5,.5,-.5),(-.5,.5,-.5),(-.5,-.5,.5),(.5,-.5,.5),(.5,.5,.5),(-.5,.5,.5)],[],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
            mesh.materials.append(material);cube_cache[key]=mesh
        o=bpy.data.objects.new(name,cube_cache[key]);bpy.context.collection.objects.link(o)
        o.location=coord(*pos);o.scale=(size[0],size[2],size[1]);return o
    bpy.ops.mesh.primitive_cube_add(size=1,location=coord(*pos));o=bpy.context.object;o.name=name
    o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(material)
    if bevel:
        mod=o.modifiers.new('Soft manufactured edges','BEVEL');mod.width=bevel;mod.segments=3
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=mod.name)
    return o
def text(name,label,pos,size,material,flat=False):
    bpy.ops.object.text_add(location=coord(*pos));o=bpy.context.object;o.name=name
    o.data.body=label;o.data.align_x='CENTER';o.data.size=size;o.data.extrude=.005;o.data.materials.append(material)
    if not flat:o.rotation_euler=(math.pi/2,0,0)
    bpy.ops.object.convert(target='MESH');return o
def clear():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def merge_materials(prefix=''):
    groups={}
    for o in list(bpy.context.scene.objects):
        if o.type=='MESH' and o.data.materials and not o.hide_get(): groups.setdefault(o.data.materials[0].name,[]).append(o)
    bpy.ops.object.select_all(action='DESELECT')
    for key,objects in groups.items():
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();objects[0].name=prefix+key
        bpy.ops.object.select_all(action='DESELECT')
def export(name,selected=False):
    bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,name+'.glb'),export_format='GLB',export_yup=True,export_cameras=False,export_lights=False,export_animations=False,use_selection=selected)
def save_part(name,objects):
    print('Saving part '+name+' '+str(len(objects)),flush=True)
    collection=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(collection)
    for o in objects:
        for old in list(o.users_collection):old.objects.unlink(o)
        collection.objects.link(o)
    part_scene=bpy.data.scenes.new(name);part_scene.collection.children.link(collection)
    print('Writing blend '+name,flush=True)
    bpy.data.libraries.write(os.path.join(SRC,name+'.blend'),{part_scene},fake_user=True)
    bpy.data.scenes.remove(part_scene)
    # Export grouped copies, retaining separate editable objects in the .blend source.
    groups={}
    for o in objects:
        clone=o.copy();clone.data=o.data.copy();bpy.context.scene.collection.objects.link(clone)
        groups.setdefault(clone.data.materials[0].name,[]).append(clone)
    merged=[]
    for group in groups.values():
        bpy.ops.object.select_all(action='DESELECT')
        for o in group:o.select_set(True)
        bpy.context.view_layer.objects.active=group[0]
        if len(group)>1:bpy.ops.object.join()
        merged.append(group[0])
    bpy.ops.object.select_all(action='DESELECT')
    for o in merged:o.select_set(True)
    export(name,True);bpy.ops.object.delete(use_global=False)
def setup_camera(target=(0,0,5),position=(0,55,48),scale=66):
    bpy.ops.object.camera_add(location=coord(*position));cam=bpy.context.object
    cam.rotation_euler=(Vector(coord(*target))-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO';cam.data.ortho_scale=scale;bpy.context.scene.camera=cam
    bpy.ops.object.light_add(type='AREA',location=(-20,-10,40));sun=bpy.context.object;sun.data.energy=4500;sun.data.shape='DISK';sun.data.size=24
    sun.rotation_euler=(Vector((0,0,0))-sun.location).to_track_quat('-Z','Y').to_euler()
    bpy.context.scene.world.color=(.35,.4,.48)

clear()
print('Building market',flush=True)
asphalt=mat('Asphalt',(.19,.20,.18),rough=.96)
grass=mat('Grass',(.18,.25,.065),rough=1)
curb=mat('Concrete',(.52,.53,.48),rough=.85)
white=mat('Road paint',(.90,.90,.79),rough=.9)
gold=mat('VIP gold',(.94,.66,.13),metal=.15)
iron=mat('Fence graphite',(.052,.065,.064),metal=.7)
glass=mat('Office glazing',(.20,.32,.35),metal=.15,rough=.18)
sign=mat('Sign midnight',(.015,.035,.13),metal=.15)
leaf=[mat('Foliage '+str(i),c,rough=1) for i,c in enumerate([(.14,.23,.04),(.23,.31,.07),(.11,.18,.03)])]
bark=mat('Bark',(.17,.11,.06))

# Coordinates also shipped as JSON: the renderer and Blender share slot positions.
slots=[]
for x in [-25,-21,-17,-13,-9,9,13,17,21,25]:slots.append(dict(id=len(slots)+1,x=x,z=-8))
for z in [4,17]:
    for i in range(10):slots.append(dict(id=len(slots)+1,x=-22.5+i*5,z=z))
for z in [-30,-42,-54,-66,-78,-90,-102]:
    for i in range(10):slots.append(dict(id=len(slots)+1,x=-22.5+i*5,z=z))
with open(os.path.join(ROOT,'slots.json'),'w') as f:json.dump(slots,f)
print('Slots ready',flush=True)
box('Ground',(0,-.35,-38),(76,.5,156),grass)
box('Market asphalt',(0,-.07,-41),(62,.18,140),asphalt)
box('Street',(0,-.04,34),(80,.2,10),asphalt)
box('Sidewalk',(0,.08,27),(76,.22,3),curb)
for x in [-31.3,31.3]:box('Curb',(x,.08,-41),(.4,.3,140),curb)
for s in slots:
    x,z=s['x'],s['z'];m=gold if s['id']<=10 else white
    for dx in [-1.8,1.8]:box('Parking line',(x+dx,.035,z),(.065,.025,6.5),m)
    for dz in [-3.25,3.25]:box('Parking line',(x,.035,z+dz),(3.6,.025,.065),m)
    text('Slot number',str(s['id']),(x,.06,z-4),.68,m,True)
    if s['id']<=10:text('VIP marking','VIP',(x,.06,z+2.65),.42,gold,True)
for z in range(-107,24,5):
    for x in [-28.7,28.7]:box('Lane dash',(x,.04,z),(.10,.02,1.5),white)
for x in range(-36,37,6):box('Street dash',(x,.075,34),(2.6,.025,.12),white)
for z in [29.8,30.8,31.8,32.8,33.8,34.8,35.8,36.8,37.8]:box('Crosswalk',(0,.08,z),(5,.02,.45),white)

fence_before=set(bpy.context.scene.objects)
print('Building fences',flush=True)
def fence(x,z,length,along_x):
    for offset in [-.0]:
        for h in [.55,1.45]:box('Fence rail',(x,h,z),(length if along_x else .08,.09,.08 if along_x else length),iron)
    for i in range(int(length/.45)+1):
        a=-length/2+i*.45;box('Fence picket',(x+a if along_x else x,1,z if along_x else z+a),(.06,2,.06),iron)
    for i in range(int(length/5)+1):
        a=-length/2+i*5;box('Fence pillar',(x+a if along_x else x,1.15,z if along_x else z+a),(.25,2.3,.25),iron)
fence(-31,-42,138,False);fence(31,-42,138,False);fence(0,-111,62,True)
fence(-18,25,26,True);fence(18,25,26,True)
for x in [-5,5]:box('Entrance pillar',(x,1.4,25),(.85,2.8,.85),curb)
text('Entry title','AUTO BAZAR',(0,.15,25),.8,white,True)
save_part('fence-and-gates',set(bpy.context.scene.objects)-fence_before)

# Central glass office, canopy, door and planted entrance.
office_before=set(bpy.context.scene.objects)
box('Office platform',(0,.16,-14),(14,.4,12),curb,.10)
box('Office walls',(0,3.1,-14),(11,5.8,7),glass,.07)
for x in [-5.5,-3.7,-1.85,0,1.85,3.7,5.5]:box('Office mullion',(x,3.1,-10.45),(.10,5.8,.15),iron)
for h in [.6,2.0,3.9,5.9]:box('Office crossbar',(0,h,-10.38),(11,.12,.15),iron)
box('Office roof',(0,6.1,-14),(11.6,.28,7.6),iron,.09)
for x in [-3.7,-1.8,0,1.8,3.7]:box('Roof skylight',(x,6.26,-14),(1.5,.05,5.8),glass,.03)
for x in [-5.7,5.7]:box('Canopy pillar',(x,1.9,-9),(.14,3.8,.14),iron)
box('Canopy',(0,3.9,-10),(12,.15,3),iron)
box('Illuminated fascia',(0,3.18,-8.44),(7,.9,.15),sign,.03)
text('AUTO BAZAR sign','AUTO BAZAR',(0,2.96,-8.32),.58,white)
box('Office door',(0,1.36,-10.26),(1.65,2.55,.1),sign)
box('Door handle',(.55,1.2,-10.16),(.045,.55,.04),white)
for i in range(3):box('Entry steps',(0,.09+i*.08,-8+i*.5),(3,.15+i*.1,.65),curb)
for x in [-6.3,6.3]:
    box('Planter',(x,.4,-10),(1,.7,4),curb,.07)
    box('Hedge',(x,.95,-10),(.8,.9,3.8),leaf[0],.2)
save_part('office',set(bpy.context.scene.objects)-office_before)

trees_before=set(bpy.context.scene.objects)
def tree(x,z,scale=1):
    box('Tree trunk',(x,1.4*scale,z),(.28*scale,2.8*scale,.28*scale),bark)
    for dx,dy,dz,s in [(0,3.5,0,1.65),(-.8,2.9,.2,1.15),(.8,3.1,-.3,1.3),(0,4.5,.1,1.1)]:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=s*scale,location=coord(x+dx*scale,dy*scale,z+dz*scale))
        o=bpy.context.object;o.name='Tree crown';o.data.materials.append(random.choice(leaf))
        for p in o.data.polygons:p.use_smooth=True
for z in range(-112,25,6):
    for x in [-35,35]:tree(x+random.uniform(-.6,.6),z,random.uniform(.85,1.2))
for x in range(-30,31,6):tree(x,-116,1.1)
for x in [-25,-15,15,25]:tree(x,28,0.7)
for x in [-25,-19,-13,13,19,25]:tree(x,-22,.8)
save_part('trees',set(bpy.context.scene.objects)-trees_before)
lights_before=set(bpy.context.scene.objects)
for z in [-20,-44,-68,-92,23]:
    for x in [-30,30]:
        box('Lamp pole',(x,3,z),(.12,6,.12),iron)
        box('Lamp head',(x,6,z),(.8,.1,.35),white,.05)
save_part('street-lamps',set(bpy.context.scene.objects)-lights_before)
setup_camera()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC,'market.blend'))
merge_materials('Market_');export('market')

# Original generic vehicle designs: distinct sedan, SUV and hatchback, no manufacturer logos.
palette={'black':(.018,.024,.027),'white':(.80,.83,.81),'silver':(.38,.43,.45),'red':(.48,.018,.025),
         'blue':(.018,.12,.49),'green':(.025,.18,.10),'yellow':(.95,.59,.015),'purple':(.24,.055,.36)}
def car(kind,color):
    paint=mat('BodyPaint',palette[color],.65,.24)
    dark=mat('Rubber',(.013,.015,.019),rough=.8)
    window=mat('Glass',(.025,.075,.10),.65,.17)
    chrome=mat('Alloy',(.48,.53,.55),.85,.22)
    lamp=mat('Headlights',(.92,.97,1),.2,.15)
    tail=mat('Tail lamps',(.6,.006,.012),.25,.2)
    length=4.55 if kind=='sedan' else 4.7 if kind=='suv' else 3.95
    width=1.92 if kind=='suv' else 1.82
    lift=.16 if kind=='suv' else 0
    box('Sill',(0,.43+lift,0),(width,.34,length-.2),paint,.16)
    box('Sculpted body',(0,.72+lift,0),(width,.55,length),paint,.24)
    # Cabin is a tapered mesh, wide at beltline and narrower at roof.
    def cabin(name,bottom,top,z0,z1,roof0,roof1,wide,narrow,material):
        verts=[coord(-wide,bottom,z0),coord(wide,bottom,z0),coord(wide,bottom,z1),coord(-wide,bottom,z1),
               coord(-narrow,top,roof0),coord(narrow,top,roof0),coord(narrow,top,roof1),coord(-narrow,top,roof1)]
        mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]);mesh.update()
        o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.data.materials.append(material)
        bevel=o.modifiers.new('Window edge','BEVEL');bevel.width=.04;bevel.segments=2;bpy.context.view_layer.objects.active=o
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    roof=1.75 if kind=='suv' else 1.40
    rear=-1.7 if kind!='sedan' else -1.40
    cabin('Glazed cabin',.93+lift,roof,rear,1.05,rear+.35,.55,width*.47,width*.38,window)
    box('Roof',(0,roof+.015,(rear+.35+.55)/2),(width*.78,.12,.55-rear-.35),paint,.07)
    for x in [-width*.47,width*.47]:
        box('B pillar',(x,1.17+lift,-.12),(.075,.6,.10),paint,.025)
        box('Mirror',(x*1.12,1.04+lift,.73),(.22,.13,.24),paint,.05)
        for z in [-.70,.42]:box('Door handle',(x*1.025,.88+lift,z),(.035,.05,.23),chrome,.02)
        box('Door seam',(x*1.011,.66+lift,-.13),(.02,.32,.018),dark)
    for x in [-width*.36,width*.36]:
        box('Headlight',(x,.76+lift,length/2-.02),(.43,.16,.07),lamp,.045)
        box('Rear light',(x,.8+lift,-length/2+.02),(.43,.16,.07),tail,.03)
    for z in [-length/2-.005,length/2+.005]:
        box('Bumper',(0,.45+lift,z),(width*.90,.16,.09),dark,.03)
        box('Number plate',(0,.65+lift,z*1.01),(.48,.13,.025),white,.01)
    box('Grille',(0,.83+lift,length/2+.01),(.65,.19,.045),dark,.025)
    for x in [-width/2,width/2]:
        for z in [-length*.30,length*.30]:
            bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.36+lift*.4,depth=.22,location=coord(x,.37+lift*.4,z),rotation=(0,math.pi/2,0))
            o=bpy.context.object;o.name='Tire';o.data.materials.append(dark)
            for p in o.data.polygons:p.use_smooth=True
            bpy.ops.mesh.primitive_cylinder_add(vertices=20,radius=.23,depth=.235,location=coord(x,.37+lift*.4,z),rotation=(0,math.pi/2,0))
            bpy.context.object.data.materials.append(chrome)
            for k in range(5):
                a=k*math.tau/5
                o=box('Wheel spoke',(x+(.125 if x>0 else -.125),.37+lift*.4+math.cos(a)*.10,z+math.sin(a)*.10),(.018,.20,.045),dark,.01)
                o.rotation_euler.x=a
    if kind=='suv':
        for x in [-.62,.62]:box('Roof rail',(x,roof+.13,-.45),(.07,.12,1.8),chrome,.03)
    merge_materials()

for kind in ['sedan','suv','hatchback']:
    clear();car(kind,'silver');export(kind)
    setup_camera((0,.6,0),(5,5,8),7)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC,kind+'.blend'))
clear()
for row,kind in enumerate(['sedan','suv','hatchback']):
    for col,color in enumerate(palette):
        before=set(bpy.context.scene.objects);car(kind,color)
        # Merge is limited by isolating each completed vehicle in a separate collection below.
        objects=[o for o in bpy.context.scene.objects if o not in before]
        for o in objects:o.location.x+=col*3.2;o.location.y+=row*6
        collection=bpy.data.collections.new(kind+'_'+color);bpy.context.scene.collection.children.link(collection)
        for o in objects:
            for old in list(o.users_collection):old.objects.unlink(o)
            collection.objects.link(o)
            o.hide_set(True)
    # hide_set does not exclude merge; all created objects are protected in merge below.
for o in bpy.context.scene.objects:o.hide_set(False)
setup_camera((11,0,-6),(22,30,25),33)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC,'car-colors.blend'))
for name in ['office','fence-and-gates','trees','street-lamps']:
    filename=os.path.join(SRC,name+'.blend')
    bpy.ops.wm.open_mainfile(filepath=filename)
    bpy.ops.wm.save_as_mainfile(filepath=filename)
print('AUTObazar assets built:',ROOT)
