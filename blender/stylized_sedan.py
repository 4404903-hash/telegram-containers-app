"""Original mobile sedan. Front is +Z in game coordinates; no textures required."""
import bpy, math


def build_sedan(mat, box, coord, outward_normals, color=(.8,.035,.045)):
    paint=mat('BodyPaint',color,metal=.05,rough=.72)
    glass=mat('Glass',(.025,.045,.065),rough=.65)
    rubber=mat('Rubber',(.018,.021,.025),rough=.95)
    alloy=mat('Alloy',(.55,.59,.63),metal=.15,rough=.65)
    light=mat('Headlights',(.95,.95,.78),rough=.65)
    tail=mat('Tail lamps',(.7,.018,.018),rough=.65)
    plate=mat('Number plate',(.82,.86,.86),rough=.8)

    def mesh(name, vertices, faces, material):
        data=bpy.data.meshes.new(name);data.from_pydata([coord(*p) for p in vertices],[],faces)
        outward_normals(data)
        obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj)
        data.materials.append(material);return obj

    # Eight broad flat facets per section keep the silhouette readable at parking scale.
    rings=[(-2.28,.72,.70),(-2.06,.87,.88),(-1.40,.92,.96),
           (.75,.92,.96),(1.72,.87,.87),(2.28,.72,.69)]
    vertices=[]
    for z,w,h in rings:
        vertices.extend([(x,y,z) for x,y in [(-w*.86,.36),(-w,.53),(-w,h-.09),
            (-w*.82,h),(w*.82,h),(w,h-.09),(w,.53),(w*.86,.36)]])
    faces=[tuple(range(7,-1,-1)),tuple(range(40,48))]
    for row in range(5):
        for col in range(8):faces.append((row*8+col,row*8+(col+1)%8,(row+1)*8+(col+1)%8,(row+1)*8+col))
    mesh('Faceted sedan body',vertices,faces,paint)

    # Separate sloping windshields leave a distinct hood and trunk.
    mesh('Dark tinted cabin',[(-.80,.94,-1.35),(.80,.94,-1.35),(.80,.94,.95),(-.80,.94,.95),
         (-.65,1.48,-.82),(.65,1.48,-.82),(.65,1.48,.38),(-.65,1.48,.38)],
         [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],glass)
    mesh('Painted roof',[(-.67,1.48,-.84),(.67,1.48,-.84),(.67,1.48,.40),(-.67,1.48,.40),
         (-.58,1.54,-.77),(.58,1.54,-.77),(.58,1.54,.33),(-.58,1.54,.33)],
         [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],paint)
    for side in [-1,1]:
        # Pillars follow the actual glass surface instead of floating beside it.
        mesh('Centre window pillar',[(side*.805,.94,-.30),(side*.805,.94,-.19),
             (side*.655,1.48,-.19),(side*.655,1.48,-.30)],[(0,1,2,3)],rubber)
        for lower,upper in [(-1.35,-.82),(.95,.38)]:
            mesh('Painted window frame',[(side*.806,.94,lower-.035),(side*.806,.94,lower+.035),
                 (side*.657,1.49,upper+.035),(side*.657,1.49,upper-.035)],[(0,1,2,3)],paint)
        box('Side mirror',(side*.99,1.02,.62),(.22,.15,.29),paint,.035)
        box('Mirror glass',(side*.99,1.025,.46),(.15,.09,.018),glass)
        box('Sill',(side*.88,.40,0),(.08,.13,2.60),rubber)
        for z in [-.85,.35]:box('Door handle',(side*.923,.83,z),(.025,.045,.20),alloy)
        box('Door division',(side*.923,.68,-.25),(.012,.30,.015),rubber)
        for z in [-1.43,1.43]:
            bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.36,depth=.25,
                location=coord(side*.87,.36,z),rotation=(0,math.pi/2,0))
            bpy.context.object.name='Twelve sided tire';bpy.context.object.data.materials.append(rubber)
            bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.225,depth=.014,
                location=coord(side*1.003,.36,z),rotation=(0,math.pi/2,0))
            bpy.context.object.name='Wheel rim';bpy.context.object.data.materials.append(alloy)
            bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.105,depth=.018,
                location=coord(side*1.015,.36,z),rotation=(0,math.pi/2,0))
            bpy.context.object.name='Wheel hub';bpy.context.object.data.materials.append(rubber)
        # Lamps wrap onto the hood/trunk so both ends read from above.
        box('Front light',(side*.54,.69,2.285),(.34,.13,.08),light,.015)
        box('Rear light',(side*.54,.70,-2.285),(.35,.14,.08),tail,.015)
    for z in [-2.29,2.29]:
        box('Bumper',(0,.46,z),(1.46,.12,.10),rubber,.025)
        box('License plate',(0,.65,z*1.023),(.40,.12,.015),plate)
    box('Front grille',(0,.59,2.32),(.64,.10,.025),rubber)
    box('Trunk seam',(0,.889,-1.91),(1.30,.008,.018),rubber)
