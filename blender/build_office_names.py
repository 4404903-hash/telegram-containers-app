"""Blender --background --python blender/build_office_names.py
Creates editable Cyrillic name sculptures and an optimized GLB addition.
"""
import bpy, math, os
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
root=os.path.abspath('public/assets/models');os.makedirs(os.path.join(root,'blend'),exist_ok=True)
font_path=os.environ.get('AUTObazar_FONT','C:/Windows/Fonts/arialbd.ttf')
if not os.path.isfile(font_path):raise RuntimeError('Set AUTObazar_FONT to a bold TTF font with Cyrillic support')
font=bpy.data.fonts.load(font_path)
def material(name,color,metal,rough):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    shader=m.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(*color,1)
    shader.inputs['Metallic'].default_value=metal;shader.inputs['Roughness'].default_value=rough
    return m
gold=material('Warm ivory lettering',(.95,.76,.39),.45,.25)
pink=material('Rose hearts',(.85,.025,.17),.45,.21)
dark=material('Graphite pedestal',(.035,.055,.065),.5,.4)
def box(name,xyz,scale):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz);o=bpy.context.object;o.name=name;o.dimensions=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(dark)
    mod=o.modifiers.new('Rounded edges','BEVEL');mod.width=.08;mod.segments=3
    bpy.ops.object.modifier_apply(modifier=mod.name)
def sculpture(label,x):
    # Blender -Y faces the viewer; exporter maps this to game +Z.
    bpy.ops.object.text_add(location=(x-.8,14,1.65),rotation=(math.pi/2,0,0))
    text=bpy.context.object;text.name=label;text.data.body=label;text.data.font=font
    text.data.align_x='CENTER';text.data.size=2.1;text.data.extrude=.11;text.data.bevel_depth=.025;text.data.bevel_resolution=3
    text.data.materials.append(gold);bpy.context.view_layer.update()
    width=text.dimensions.x;bpy.ops.object.convert(target='MESH')
    heart_x=x-.8+width/2+1.0
    curve=bpy.data.curves.new('Heart profile','CURVE');curve.dimensions='2D';curve.fill_mode='BOTH';curve.resolution_u=12
    curve.extrude=.12;curve.bevel_depth=.07;curve.bevel_resolution=4
    spline=curve.splines.new('POLY');spline.points.add(95)
    for i,p in enumerate(spline.points):
        t=i*2*math.pi/96
        p.co=(16*math.sin(t)**3*.055,(13*math.cos(t)-5*math.cos(2*t)-2*math.cos(3*t)-math.cos(4*t))*.055,0,1)
    spline.use_cyclic_u=True
    heart=bpy.data.objects.new(label+' heart',curve);bpy.context.collection.objects.link(heart)
    heart.location=(heart_x,14,2.55);heart.rotation_euler=(math.pi/2,0,0);curve.materials.append(pink)
    bpy.ops.object.select_all(action='DESELECT');heart.select_set(True);bpy.context.view_layer.objects.active=heart;bpy.ops.object.convert(target='MESH')
    box(label+' pedestal',(x,14,1.5),(8.4,.6,.22))
    for offset in [-3.3,3.3]:box(label+' support',(x+offset,14,.72),(.14,.22,1.45))
sculpture('Сашка',-12);sculpture('Марк',12)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=os.path.join(root,'office-names.glb'),export_format='GLB',export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
bpy.ops.object.camera_add(location=(0,-24,25));cam=bpy.context.object
cam.rotation_euler=(Vector((0,14,2))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=38;bpy.context.scene.camera=cam
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root,'blend/office-names.blend'))
print('Created Сашка and Марк with 3D hearts')
