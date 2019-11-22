var bitsy = window;

var engine;
var scene;
var meshTemplates = {};

var baseMat;
var textCanvas;
var textContext;
var fakeContext = {
    drawImage: function () {},
    fillRect: function () {},
};

var roomsInStack = {};
var stackPosOfRoom = {};

var lastStack;
var curStack;

var lastRoom;

var tilesInStack = {};

var sprites = {};
var items = {};

var hackOptions = {
    // Determines the resolution of the scene rendered
    // If auto is true, the width/height will be ignored,
    // and the scene will instead render at 1:1 with the canvas
    // use it if you want it to look crisp on any screen
    // otherwise, I recommend something in the range of 64-512
    size: {
        auto: true,
        width: 512,
        height: 512,
    },
    // set clear color and fog color
    // default is 0: background color in the current bitsy pallete
    clearColor: 0,
    fogColor: 0,
    // If true, inputs are rotated to match the current camera direction
    // if you're using a camera that can be freely rotated,
    // this will generally be preferable,
    // but you may want to disable it for some setups
    // (e.g. a fixed third person camera)
    cameraRelativeMovement: true,
    // If true, left/right inputs are overridden to control 90-degree camera rotations
    // this requires `cameraRelativeMovement: true` to be usable,
    // and it's recommended to not add camera controls if used
    tankControls: false,
    // scene setup
    // a number of helper functions are provided to make this easier
    // but the only necessary thing is to create a camera and assign it to the scene
    init: function (scene) {
        scene.activeCamera = makeBaseCamera(); // creates a camera with some basic presets
        // makeOrthographic(camera, bitsy.mapsize); // makes the camera use orthographic projection (camera, size)
        makeFollowPlayer(scene.activeCamera); // locks the camera to the player
        addControls(scene.activeCamera); // adds rotate/zoom controls (also pan if not following player)
        // addFog(0.5, 1.0); // adds fog in the range (start, end)
        // addShader(`shader source`, 1.0); // adds a post-processing shader (shader source, downscale factor)
    },
    // If true, dialog renders at the top
    // otherwise, renders at the bottom
    // (bitsy's typical position-based rendering doesn't make sense in 3D)
    topDialog: true,
    // Function used in transparent sprites hack
    isTransparent: function (drawing) {
        var name = drawing.name || '';
        var match = name.match(/#transparent\(((true)|(false))\)/);
        if (match) {
            // 2nd capturing group reserved for 'true' will be undefined if the input said 'false'
            return Boolean(match[2]);
        }
        return !drawing.drw.includes('TIL');
    },
    // Function used to determine how a bitsy drawing is translated into a 3D object
    // available types are:
    //  - 'plane': plane standing up straight
    //  - 'billboard': like plane, but turns to look at the camera
    //  - 'box': standard cube
    //  - 'floor': plane flat on the ground
    //  - 'tower1', 'tower2', etc: box variations that are taller and tiled
    //  - 'wedge': base mesh for wedges, facing left with its slanted side
    //  - 'empty': empty mesh for making drawings invisible
    getType: function (drawing) {
        var drw = drawing.drw;
        var name = drawing.name || '';

        // match the drawing's name against the regular expression
        // that describes #mesh(type) tag
        var meshMatch = name.match(/#mesh\((.+?)\)/);
        if (meshMatch) {
            if (meshTemplates[meshMatch[1]]) {
                return meshMatch[1];
            } else {
                // if the specified mesh template doesn't exist,
                // display error message, but continue execution
                // to resolve the mesh with default logic
                console.error(`mesh template '${meshMatch[1]}' wasn't found`);
            }
        }

        // default
        if (drawing.id === bitsy.playerId) {
            return 'plane';
        }
        if (drw.startsWith('ITM')) {
            return 'plane';
        }
        if (drw.startsWith('SPR')) {
            return 'billboard';
        }
        if (drawing.isWall) {
            return 'box';
        }
        return 'floor';
    },
    // controls how the 'billboard' type behaves
    // recommendation: the default provided below, or BABYLON.TransformNode.BILLBOARDMODE_ALL
    getBillboardMode: function (BABYLON) {
        return BABYLON.TransformNode.BILLBOARDMODE_Y | BABYLON.TransformNode.BILLBOARDMODE_Z;
    },
    // If true, textures will be preloaded before they're needed while idle
    // it's recommended to keep this on for more consistent performance post-startup
    // (without it, you may notice stutter the first time you enter a room)
    // but if you have a big, highly branching game with lots of art,
    // you may want to disable it
    preloadTextures: true,

    // function used to adjust mesh instances after they have been added to the scene
    meshExtraSetup: function (drawing, mesh) {
        var name = drawing.name || '';

        // transform tags. #t(x,y,z): translate (move), #r(x,y,z): rotate, #s(x,y,z): scale
        // #m(1,0,0.5) and #m(1,,.5) are both examples of valid input
        // scale
        var scaleTag = name.match(/#s\((-?\.?\d*\.?\d*)?,(-?\.?\d*\.?\d*)?,(-?\.?\d*\.?\d*)?\)/);
        if (scaleTag) {
            mesh.scaling = new BABYLON.Vector3(
                Number(scaleTag[1]) || 0,
                Number(scaleTag[2]) || 0,
                Number(scaleTag[3]) || 0
            );
        }
        // rotate. input in degrees
        var rotateTag = name.match(/#r\((-?\.?\d*\.?\d*)?,(-?\.?\d*\.?\d*)?,(-?\.?\d*\.?\d*)?\)/);
        if (rotateTag) {
            mesh.rotation.x += radians(Number(rotateTag[1]) || 0);
            mesh.rotation.y += radians(Number(rotateTag[2]) || 0);
            mesh.rotation.z += radians(Number(rotateTag[3]) || 0);
        }
        // translate (move)
        var translateTag = name.match(/#t\((-?\.?\d*\.?\d*)?,(-?\.?\d*\.?\d*)?,(-?\.?\d*\.?\d*)?\)/);
        if (translateTag) {
            mesh.position.x += (Number(translateTag[1]) || 0);
            mesh.position.y += (Number(translateTag[2]) || 0);
            mesh.position.z += (Number(translateTag[3]) || 0);
        }

        // children tag
        // for now for animation to work gotta make sure that the parent drawing has as many frames as children
        var childrenTag;
        // make sure the mesh we are about to add children to doesn't have a parent on its own to avoid ifinite loops
        // maybe add checking for parents of parents recursively up to a certain number to allow more complex combinations
        if (!mesh.parent) {
            childrenTag = name.match(/#children\(([\w-, ]+)\)/);
        }
        if (childrenTag) {
            // parse args and get the actual drawings
            var children = childrenTag[1].split(/, |,/).map(function(arg) {
                if (arg) {
                    var type, id, map;
                    [type, id] = arg.split(/[ _-]/);
                    if (type && id) {
                        switch (type[0].toLowerCase()) {
                            case 't':
                                map = bitsy.tile;
                                break;
                            case 'i':
                                map = bitsy.item;
                                break;
                            case 's':
                                map = bitsy.sprite;
                        }
                        if (map) {
                            return map[id];
                        }
                    }
                }
            }).filter(Boolean);

            // add specified drawings to the scene as child meshes
            children.forEach(function(childDrawing) {
                var childMesh = getMesh(childDrawing, bitsy.curPal());
                childMesh = childMesh.createInstance();
                childMesh.position.x = mesh.position.x;
                childMesh.position.y = mesh.position.y;
                childMesh.position.z = mesh.position.z;
                mesh.addChild(childMesh);
                applyBehaviours(childMesh, childDrawing);
                // make sure children can move if they are parented to the avatar
                if (drawing == bitsy.player()) {
                    childMesh.unfreezeWorldMatrix();
                }
            });
        }
    },
    // smooth moves hack options
    // duration of ease in ms
    duration: 100,
    // max distance to allow tweens
    delta: 1.5,
    // easing function
    ease: function(t) {
        t = 1 - Math.pow(1 - t, 2);
        return t;
    },
};

function initRoom3d() {
    var canvas3d = document.getElementById('room3d');
    console.log('canvas3d');
    console.log(canvas3d);
    canvas3d.width = 512;
    canvas3d.height = 512;

    engine = new BABYLON.Engine(canvas3d, false);
    scene = new BABYLON.Scene(engine);
    scene.ambientColor = new BABYLON.Color3(1, 1, 1);
    scene.freezeActiveMeshes();

    // create basic resources
    // box and towers
    for (var i = 1; i <= bitsy.mapsize; ++i) {
        var boxMesh = BABYLON.MeshBuilder.CreateBox('tower' + i, {
            size: 1,
            height: i,
            faceUV: [
                new BABYLON.Vector4(0, 0, 1, i), // "back"
                new BABYLON.Vector4(0, 0, 1, i), // "front"
                new BABYLON.Vector4(0, 0, 1, i), // "right"
                new BABYLON.Vector4(0, 0, 1, i), // "left"
                new BABYLON.Vector4(0, 0, 1, 1), // "top"
                new BABYLON.Vector4(0, 0, 1, 1), // "bottom"
            ],
            wrap: true,
        }, scene);
        var uvs = boxMesh.getVerticesData(BABYLON.VertexBuffer.UVKind);
        boxMesh.setVerticesData(BABYLON.VertexBuffer.UVKind, uvs);
        boxMesh.isVisible = false;
        boxMesh.doNotSyncBoundingInfo = true;
        // adjust template position so that the instances will be displated correctly
        transformGeometry(boxMesh, BABYLON.Matrix.Translation(0.0, i / 2 - 0.5, 0.0));
        meshTemplates['tower' + i] = boxMesh;
    }
    meshTemplates.box = meshTemplates.tower1;

    // floor
    var floorMesh = BABYLON.MeshBuilder.CreatePlane(`floor`, {
        width: 1,
        height: 1,
    }, scene);
    // adjust template position so that the instances will be displated correctly
    transformGeometry(floorMesh, BABYLON.Matrix.Translation(0.0, 0.0, 0.5));
    // have to transform geometry instead of using regular rotation
    // or it will mess up children transforms when using combine tag
    transformGeometry(floorMesh, BABYLON.Matrix.RotationX(Math.PI/2));
    floorMesh.isVisible = false;
    floorMesh.doNotSyncBoundingInfo = true;
    meshTemplates.floor = floorMesh;

    // plane
    var planeMesh = BABYLON.MeshBuilder.CreatePlane('plane', {
        width: 1,
        height: 1,
        sideOrientation: BABYLON.Mesh.DOUBLESIDE,
        frontUVs: new BABYLON.Vector4(0, 1, 1, 0),
        backUVs: new BABYLON.Vector4(0, 1, 1, 0),
    }, scene);
    // in case of rotation have to transform geometry or it will affect positions of its children
    transformGeometry(planeMesh, BABYLON.Matrix.RotationX(Math.PI));
    planeMesh.isVisible = false;
    meshTemplates.plane = planeMesh;
    planeMesh.doNotSyncBoundingInfo = true;
    meshTemplates.billboard = planeMesh.clone('billboard');

    // wedge
    var wedgeMesh = new BABYLON.Mesh("wedgeMesh", scene);
    var wedgeMeshPos = [
        -1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, -1, 0, 1, 0, 1, 1, // 0,1,2, 3,4,5,
        -1, 0, 1, -1, 0, 0, 0, 1, 0, 0, 1, 1, // 6,7,8,9
        0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, // 10,11,12,13
        0, 0, 1, 0, 0, 0, -1, 0, 0, -1, 0, 1 // 14,15,16,17
    ];
    var wedgeMeshInd = [
        0, 1, 2, 3, 4, 5, //triangles on the front and the back
        6, 7, 8, 8, 9, 6, // tris that make up the sliding face at the top
        10, 11, 12, 12, 13, 10, // right face
        14, 15, 16, 16, 17, 14 // bottom face
    ];
    var wedgeMeshUvs = [
        0, 0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1,
        0, 0, 1, 0, 1, 1, 0, 1,
        0, 0, 1, 0, 1, 1, 0, 1,
        0, 0, 1, 0, 1, 1, 0, 1
    ];
    var wedgeMeshVertData = new BABYLON.VertexData();
    wedgeMeshVertData.positions = wedgeMeshPos;
    wedgeMeshVertData.indices = wedgeMeshInd;
    wedgeMeshVertData.uvs = wedgeMeshUvs;

    var translation = BABYLON.Matrix.Translation(0.5, -0.5, -0.5);
    wedgeMeshVertData.transform(translation);

    wedgeMeshVertData.applyToMesh(wedgeMesh);
    wedgeMesh.isVisible = false; // but newly created copies and instances will be visible by default
    wedgeMesh.doNotSyncBoundingInfo = true;

    meshTemplates.wedge = wedgeMesh;

    // empty mesh for making drawings invisible
    var emptyMesh = new BABYLON.Mesh("emptyMesh", scene);
    meshTemplates.empty = emptyMesh;

    // material
    baseMat = new BABYLON.StandardMaterial('base material', scene);
    baseMat.ambientColor = new BABYLON.Color3(1, 1, 1);
    baseMat.maxSimultaneousLights = 0;
    baseMat.freeze();

    // set up camera
    // todo: make a proper camera
    var camera = new BABYLON.ArcRotateCamera("Camera", Math.PI / 2, Math.PI / 2, 15, new BABYLON.Vector3(8,0,8), scene);
    // perspective clipping
    camera.position = new BABYLON.Vector3(7.5,10,-16);
    camera.minZ = 0.001;
    camera.maxZ = bitsy.mapsize * 5;
    // zoom
    camera.wheelPrecision = bitsy.mapsize;
    camera.upperRadiusLimit = 30;
    camera.lowerRadiusLimit = 1;

    camera.lowerHeightOffsetLimit = 0;
    camera.upperHeightOffsetLimit = bitsy.mapsize / 2;
    camera.upperBetaLimit = Math.PI / 2;

    camera.attachControl(canvas3d);

    // Watch for browser/canvas resize events
    engine.setSize(hackOptions.size.width, hackOptions.size.height);
    if (hackOptions.size.auto) {
        engine.resize();
        window.addEventListener("resize", function () {
            engine.resize();
        });
    }

    // register room stacks here
    Object.values(bitsy.room).forEach(function (room) {
        var name = room.name || '';
        var stackId = '-' + room.id + '-';
        var stackPos = 0;
        var tag = name.match(/#stack\(([a-zA-Z]+),(-?\.?\d*\.?\d*)\)/);
        if (tag) {
            stackId = tag[1];
            stackPos = Number(tag[2]) || 0;
        }
        roomsInStack[stackId] = roomsInStack[stackId] || []
        roomsInStack[stackId].push(room.id);

        stackPosOfRoom[room.id] = {
            stack: stackId,
            pos: stackPos,
        };
    });

    // create tile arrays for stacks
    // entry[0] is stackId, entry[1] is an array of roomsIds in the stack
    Object.entries(roomsInStack).forEach(function (entry) {
        tilesInStack[entry[0]] = makeTilesArray(entry[1].length);
    });

    // Add lights to the scene
    // var light1 = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(1, 1, 0), scene);
    // var light2 = new BABYLON.PointLight("light2", new BABYLON.Vector3(0, 1, -1), scene);

    // // Add and manipulate meshes in the scene
    // var sphere = BABYLON.MeshBuilder.CreateSphere("sphere", {diameter:2}, scene);

    // set the rendering loop function
    engine.runRenderLoop(render3d);



    // add event listeners
    canvas3d.addEventListener('mouseover', function (e) {
        // todo: register per-frame or per-interval mouse picking
        scene.constantlyUpdateMeshUnderPointer = true;
        // now scene.meshUnderPointer can be used to get the mesh we are currently hovering over
    });

    canvas3d.addEventListener('mouseleave', function (e) {
        // todo: unregister mouse picking
        scene.constantlyUpdateMeshUnderPointer = false;
    });

    canvas3d.addEventListener('click', function (e) {
        if (scene.meshUnderPointer) {
            scene.meshUnderPointer.dispose();
        }
    });
}

function render3d() {
    room3dUpdate();
    scene.render();
    // console.log(scene.meshUnderPointer)
}

function radians(degrees) {
    return degrees * Math.PI / 180;
}

function applyBehaviours(targetMesh, drawing) {
    hackOptions.meshExtraSetup(drawing, targetMesh);
    if (targetMesh.sourceMesh.source.name === 'billboard') {
        targetMesh.billboardMode = hackOptions.getBillboardMode(BABYLON);
    } else {
        targetMesh.freezeWorldMatrix();
    }
}

// to adjust vertices on the mesh
function transformGeometry(mesh, matrix) {
    var vertData = BABYLON.VertexData.ExtractFromMesh(mesh);
    vertData.transform(matrix);
    vertData.applyToMesh(mesh);
}

function makeTilesArray(stackSize) {
    var a = [];
    for (var y = 0; y < bitsy.mapsize; ++y) {
        var row = [];
        for (var x = 0; x < bitsy.mapsize; ++x) {
            var coln = [];
            for (var z = 0; z < stackSize; ++z) {
                coln.push(['-1', null]);
            }
            row.push(coln);
        }
        a.push(row);
    }
    return a;
}

// cache helper
function getCache(make) {
    var cache = {};
    return function (id, args) {
        var cached = cache[id];
        if (cached) {
            return cached;
        }
        cached = cache[id] = make.apply(undefined, args);
        return cached;
    };
}

var getTextureFromCache = getCache(function (drawing, pal) {
    var c = bitsy.renderer.GetImage(drawing, pal);
    // mock tile draw with palette shenanigans
    // to force transparency to take effect
    var p = bitsy.getRoomPal(bitsy.player().room);
    bitsy.room[bitsy.player().room].pal = pal;
    bitsy.drawTile(c, 0, 0, fakeContext);
    bitsy.room[bitsy.player().room].pal = p;

    var tex = new BABYLON.DynamicTexture('test', {
        width: c.width,
        height: c.height,
    }, scene, false, BABYLON.Texture.NEAREST_NEAREST_MIPNEAREST);
    tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    if (hackOptions.isTransparent(drawing)) {
        tex.hasAlpha = true;
    }
    var ctx = tex.getContext();
    ctx.drawImage(c, 0, 0);
    tex.update();
    return tex;
});

function getTexture(drawing, pal) {
    var drw = drawing.drw;
    var col = drawing.col;
    var frame = drawing.animation.frameIndex;
    var key = `${drw},${col},${pal},${frame}`;
    return getTextureFromCache(key, [drawing, pal]);
}

var getMaterialFromCache = getCache(function (drawing, pal) {
    var mat = baseMat.clone();
    mat.diffuseTexture = getTexture(drawing, pal);
    mat.freeze();
    return mat;
});

function getMaterial(drawing, pal) {
    var drw = drawing.drw;
    var col = drawing.col;
    var frame = drawing.animation.frameIndex;
    var key = `${drw},${col},${pal},${frame}`;
    return getMaterialFromCache(key, [drawing, pal]);
}

var getMeshFromCache = getCache(function (drawing, pal, type) {
    var mesh = meshTemplates[type].clone();
    mesh.makeGeometryUnique();
    mesh.isVisible = false;
    mesh.material = getMaterial(drawing, pal);
    // enable vertical tiling for towers
    if (type.startsWith('tower')) {
        mesh.material.diffuseTexture.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    }
    return mesh;
});

function getMesh(drawing, pal) {
    var type = hackOptions.getType(drawing);
    var drw = drawing.drw;
    var col = drawing.col;
    var frame = drawing.animation.frameIndex;
    // include type in the key to account for cases when drawings that link to
    // the same 'drw' need to have different types when using with other hacks
    var key = `${drw},${col},${pal},${frame},${type}`;
    return getMeshFromCache(key, [drawing, pal, type]);
}

function room3dUpdate() {
    // console.log("update called");
    curStack = stackPosOfRoom[bitsy.curRoom].stack;

    // sprite changes
    Object.entries(sprites).forEach(function (entry) {
        if (stackPosOfRoom[bitsy.sprite[entry[0]].room].stack !== curStack) {
            entry[1].dispose();
            entry[1] = null;
            delete sprites[entry[0]];
        }
    });
    Object.values(bitsy.sprite).filter(function (sprite) {
        // make sure 'stackPosOfRoom[sprite.room]' is defined to account for cases when
        // the sprites refer to deleted rooms
        return stackPosOfRoom[sprite.room] && stackPosOfRoom[sprite.room].stack === curStack;
    }).forEach(function (sprite) {
        var id = sprite.id;
        var oldMesh = sprites[id];
        var newMesh = getMesh(sprite, bitsy.curPal());
        if (newMesh !== (oldMesh && oldMesh.sourceMesh)) {
            if (oldMesh) {
                oldMesh.dispose();
            }
            newMesh = newMesh.createInstance();
            newMesh.position.x = sprite.x;
            newMesh.position.z = bitsy.mapsize - sprite.y;
            newMesh.position.y = stackPosOfRoom[sprite.room].pos;
            if (id === bitsy.playerId) {
                newMesh.name = 'player';
            }
            applyBehaviours(newMesh, sprite);
            sprites[id] = oldMesh = newMesh;
        }
    });
    // make sure the avatar is rendered at the correct height
    // when they enter new rooms in the stack
    // if (lastRoom && lastRoom !== bitsy.curRoom) {
    //     sprites[bitsy.playerId].position.y = stackPosOfRoom[bitsy.curRoom].pos;
    // }

    // item changes
    // delete irrelevant items
    Object.entries(items).forEach(function (entry) {
        var roomId = entry[0].slice(0, entry[0].indexOf(','));
        if (stackPosOfRoom[roomId].stack === curStack) {
            // if this item in current stack
            // check if it is still listed its room
            // if so keep it as it is and return
            if (bitsy.room[roomId].items.find(function (item) {
                    return `${roomId},${item.id},${item.x},${item.y}` === entry[0];
                })) {
                return;
            }
        }
        // if this item is not in the current stack
        // or in the current stack but was picked up or stolen by demons
        entry[1].dispose();
        entry[1] = null;
        delete items[entry[0]];
    });

    // make/update relevant items
    roomsInStack[curStack].forEach(function (roomId) {
        bitsy.room[roomId].items.forEach(function (roomItem) {
            var key = `${roomId},${roomItem.id},${roomItem.x},${roomItem.y}`;
            var item = bitsy.item[roomItem.id];
            var oldMesh = items[key];
            var newMesh = getMesh(item, bitsy.curPal());
            if (newMesh !== (oldMesh && oldMesh.sourceMesh)) {
                if (oldMesh) {
                    oldMesh.dispose();
                }
                newMesh = newMesh.createInstance();
                newMesh.position.x = roomItem.x;
                newMesh.position.z = bitsy.mapsize - roomItem.y;
                newMesh.position.y = stackPosOfRoom[roomId].pos;
                applyBehaviours(newMesh, item);
                items[key] = newMesh;
            }
        });
    });

    // tile changes
    // check if we entered a new stack
    // if so make sure tiles from the old stack aren't visible
    if (lastStack && lastStack !== curStack) {
        tilesInStack[lastStack].forEach(function (row) {
            row.forEach(function (coln) {
                coln.forEach(function (tileEntry) {
                    if (tileEntry[1] !== null) {
                        tileEntry[1].dispose();
                        tileEntry[1] = null;
                    }
                });
            });
        });
    }

    roomsInStack[curStack].forEach(function (roomId, roomIdIndex) {
        var tilemap = bitsy.room[roomId].tilemap;
        for (var y = 0; y < tilemap.length; ++y) {
            var row = tilemap[y];
            for (var x = 0; x < row.length; ++x) {
                var roomTile = row[x];
                var tile = tilesInStack[curStack][y][x][roomIdIndex];
                tile[0] = roomTile;
                var oldMesh = tile[1];
                if (roomTile === '0') {
                    if (oldMesh) {
                        oldMesh.dispose();
                    }
                    tile[1] = null;
                    continue;
                }
                var newMesh = getMesh(bitsy.tile[roomTile], bitsy.curPal());
                if (newMesh === (oldMesh && oldMesh.sourceMesh)) {
                    continue;
                }
                newMesh = newMesh.createInstance();
                newMesh.position.x = x;
                newMesh.position.z = bitsy.mapsize - y;
                newMesh.position.y = stackPosOfRoom[roomId].pos;
                applyBehaviours(newMesh, bitsy.tile[roomTile]);
                if (oldMesh) {
                    oldMesh.dispose();
                }
                tile[1] = newMesh;
            }
        }
    });

    // bg changes
    scene.clearColor = getColor(hackOptions.clearColor);
    scene.fogColor = getColor(hackOptions.fogColor);

    // remember what stack we were in in this frame
    lastStack = curStack;
    lastRoom = bitsy.curRoom;
}

function getColor(colorId) {
    var col = bitsy.palette[bitsy.curPal()].colors[colorId];
    return new BABYLON.Color3(
        col[0] / 255,
        col[1] / 255,
        col[2] / 255
    );
}
