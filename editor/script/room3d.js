var bitsy = window;

var b3d = {
    engine: null,
    scene: null,
    size: {
        auto: true,
        width: 512,
        height: 512,
    },
    clearColor: 0,
    fogColor: 0,

    meshTemplates: {},

    baseMat: null,

    roomsInStack: {},
    stackPosOfRoom: {},
    curStack: null,

    sprites: {},
    items: {},
    tiles: {},

    caches: {},
};

var editor3d = {
    CursorModes: {
        Add: 0,
        Remove: 1,
        Select: 2,
    },

    CursorColors: {
        Green: new BABYLON.Color3(0, 1, 0.5),
        Red: new BABYLON.Color3(1, 0.3, 0.3),
        Gray: new BABYLON.Color3(1, 1, 1),
    },

    // debug. set this when clicking on the mesh in select mode
    curSelectedMesh: null,

    groundMesh: null,
}

editor3d.cursor = {
    mesh: null,
    roomX: null,
    roomY: null,
    curRoomId: undefined,
    isValid: false,
    mode: editor3d.CursorModes.Add,
    shouldUpdate: false,
    pickedMesh: null,
    isMouseDown: false,
    isAltDown: false,
    isShiftDown: false,
    // track if cursor mode was modified by holding down alt for switching to select mode
    modeBeforeModified: null,
};

function initRoom3d() {
    var canvas3d = document.getElementById('room3dCanvas');
    console.log('canvas3d');
    console.log(canvas3d);
    canvas3d.width = 512;
    canvas3d.height = 512;

    b3d.engine = new BABYLON.Engine(canvas3d, false);
    b3d.scene = new BABYLON.Scene(b3d.engine);
    b3d.scene.ambientColor = new BABYLON.Color3(1, 1, 1);
    b3d.scene.freezeActiveMeshes();

    // make a mesh for 3d cursor
    editor3d.cursor.mesh = BABYLON.MeshBuilder.CreateBox('cursor', { size: 1.1 }, b3d.scene);
    editor3d.cursor.mesh.isPickable = false;
    var cursorMat = new BABYLON.StandardMaterial("cursorMaterial", b3d.scene);
    cursorMat.ambientColor = editor3d.CursorColors.Green;
    cursorMat.alpha = 0.5;
    editor3d.cursor.mesh.material = cursorMat;

    // add ground floor mesh
    editor3d.groundMesh = BABYLON.MeshBuilder.CreatePlane('ground', {
        width: bitsy.mapsize,
        height: bitsy.mapsize,
    }, b3d.scene);
    transformGeometry(editor3d.groundMesh, BABYLON.Matrix.Translation(bitsy.mapsize/2 - 0.5, bitsy.mapsize/2 - 0.5, 0.5));
    transformGeometry(editor3d.groundMesh, BABYLON.Matrix.RotationX(Math.PI/2));
    var groundMat = new BABYLON.StandardMaterial('ground material', b3d.scene);
    groundMat.maxSimultaneousLights = 0;
    groundMat.freeze();
    groundMat.alpha = 0;
    editor3d.groundMesh.material = groundMat;

    // create basic resources
    b3d.meshTemplates = initMeshTemplates();

    // material
    b3d.baseMat = new BABYLON.StandardMaterial('base material', b3d.scene);
    b3d.baseMat.ambientColor = new BABYLON.Color3(1, 1, 1);
    b3d.baseMat.maxSimultaneousLights = 0;
    b3d.baseMat.freeze();

    // set up camera
    // todo: make a proper camera
    var camera = new BABYLON.ArcRotateCamera("Camera", Math.PI / 2, Math.PI / 2, 15, new BABYLON.Vector3(8,0,8), b3d.scene);
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
    b3d.engine.setSize(b3d.size.width, b3d.size.height);
    if (b3d.size.auto) {
        b3d.engine.resize();
        window.addEventListener("resize", function () {
            b3d.engine.resize();
        });
    }

    initRoomStacks();

    // set the rendering loop function
    b3d.engine.runRenderLoop(render3d);

    // add event listeners
    canvas3d.addEventListener('mouseover', function (e) {
        // register 3d cursor update & mouse picking
        editor3d.cursor.shouldUpdate = true;
    });

    canvas3d.addEventListener('mouseleave', function (e) {
        // unregister 3d cursor update & mouse picking
        editor3d.cursor.shouldUpdate = false;
    });

    // switch cursor mode when starting to hold alt and shift
    document.addEventListener('keydown', function(e) {
        switch (e.code) {
            case 'AltLeft':
            case 'AltRight':
                editor3d.cursor.isAltDown = true;
                if (editor3d.cursor.modeBeforeModified === null) {
                    editor3d.cursor.modeBeforeModified = editor3d.cursor.mode;
                    if (editor3d.cursor.isShiftDown) {
                        editor3d.cursor.mode = editor3d.CursorModes.Remove;
                    } else {
                        editor3d.cursor.mode = editor3d.CursorModes.Select;
                    }
                }
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                editor3d.cursor.isShiftDown = true;
                if (editor3d.cursor.isAltDown && editor3d.cursor.mode === editor3d.CursorModes.Select) {
                    editor3d.cursor.mode = editor3d.CursorModes.Remove;
                }
                break;
        }
    });

    // switch cursor mode with number keys and when releasing alt and shift
    document.addEventListener('keyup', function(e) {
        switch (e.code) {
            case 'AltLeft':
            case 'AltRight':
                editor3d.cursor.isAltDown = false;
                if (editor3d.cursor.modeBeforeModified !== null) {
                    editor3d.cursor.mode = editor3d.cursor.modeBeforeModified;
                    editor3d.cursor.modeBeforeModified = null;
                }
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                editor3d.cursor.isShiftDown = false;
                if (editor3d.cursor.isAltDown && editor3d.cursor.mode === editor3d.CursorModes.Remove) {
                    editor3d.cursor.mode = editor3d.CursorModes.Select;
                }
                break;
        }
    });

    b3d.scene.onPointerDown = function (e) {
        editor3d.cursor.isMouseDown = true;
    };

    b3d.scene.onPointerMove = function (e) {
        // don't update the cursor when moving the camera
        if (editor3d.cursor.shouldUpdate && editor3d.cursor.isMouseDown) {
            editor3d.cursor.shouldUpdate = false;
            editor3d.cursor.isValid = false;
            editor3d.cursor.mesh.isVisible = false;
        }
    };

    b3d.scene.onPointerUp = room3dOnClick;

    // update textures when pallete is changed
    bitsy.events.Listen('palette_change', function(event) {
        if (bitsy.paletteTool) updateColor(bitsy.paletteTool.GetSelectedId());
        // console.log('palette change event hiya hey');
    });

    // update texture for the current drawing when editing with paint tool
    // this relies on event listeners being called in order
    // it should work in any browser that implements dom3 events
    document.getElementById('paint').addEventListener('mouseup', function(e) {
        updateTexture(bitsy.paintTool.getCurObject().drw, bitsy.paintTool.curDrawingFrameIndex);
        console.log('PAINT EVENT');
    });

    bitsy.events.Listen("game_data_change", function() {
        // since there is no way to tell what exactly was changed, reset everything
        // reset stack objects
        b3d.roomsInStack = {};
        b3d.stackPosOfRoom = {};
        initRoomStacks();
        // clear all caches to force all drawings to reset during the update
        removeFromCaches(Object.values(b3d.caches));
        // this fixes 3d editor crash when removing rooms right after modifying game data
        bitsy.selectRoom(bitsy.curRoom);
    });

    // patch delete room function
    var deleteRoomOrig = bitsy.deleteRoom;
    bitsy.deleteRoom = function() {
        var deletedRoom = bitsy.curRoom;
        deleteRoomOrig.call();
        // check if the room was actually deleted after the dialog
        if (bitsy.curRoom !== deletedRoom) {
            unregisterRoomFromStack(deletedRoom);
        }
    }
} // initRoom3d()

// initialize 3d editor
document.addEventListener('DOMContentLoaded', function() {
    // hook up init function
    var s = bitsy.start;
    bitsy.start = function() {
        s.call();
        initRoom3d();
        // set up mesh panel ui after 3d editor data has been initialized
        meshPanel.init();
    };

    // insert new panels in default prefs
    bitsy.defaultPanelPrefs.workspace.forEach(function(panel) {
        if (panel.position > 0) {
            panel.position = panel.position + 2;
        }
    });
    bitsy.defaultPanelPrefs.workspace.splice(1, 0,
        { id:"room3dPanel", visible:true, position:1 },
        { id:"meshPanel", visible:true, position:2 }
    );
});

// stack helper functions
function initRoomStacks() {
    // register room stacks here
    Object.values(bitsy.room).forEach(function (room) {
        var name = room.name || '';
        var tag = name.match(/#stack\(([a-zA-Z]+),(-?\.?\d*\.?\d*)\)/);
        if (tag) {
            registerRoomInStack(room.id, tag[1], Number(tag[2]) || 0);
        }
    });
}

function addRoomToStack(roomId, stackId, pos) {
    var room = bitsy.room[roomId];
    var tag = `#stack(${stackId},${pos})`;
    room.name = room.name && ' ' + tag || tag;
    bitsy.updateNamesFromCurData();
    registerRoomInStack(roomId, stackId, pos);
}

function registerRoomInStack(roomId, stackId, pos) {
    b3d.roomsInStack[stackId] = b3d.roomsInStack[stackId] || [];
    b3d.roomsInStack[stackId].push(roomId);
    b3d.stackPosOfRoom[roomId] = {
        stack: stackId,
        pos: pos,
    };
}

function unregisterRoomFromStack(roomId) {
    if (!b3d.stackPosOfRoom[roomId]) return;
    var stackId = b3d.stackPosOfRoom[roomId].stack;
    b3d.roomsInStack[stackId].splice(b3d.roomsInStack[stackId].indexOf(roomId), 1);
    delete b3d.stackPosOfRoom[roomId];
    // delete the stack if it became empty
    if (b3d.roomsInStack[stackId].length === 0) {
        delete b3d.roomsInStack[stackId];
    }
}

function newStackId() {
    // generate valid stack id
    // for now only use letters
    // this will ensure compatibility with current version of 3d hack

    function makeLetters(charCodes) {
        return charCodes.map(function(c) {
            return String.fromCharCode(c);
        }).join('');
    }

    function increment(arr, min, max) {
        for (var i = arr.length - 1; i >= 0; i--) {
            arr[i] = arr[i] + 1;
            if (arr[i] === max + 1) {
                if (i > 0) {
                    arr[i] = min;
                    continue;
                } else {            
                    var newLength = arr.length + 1;
                    for (var n = 0; n < newLength; n++) {
                        arr[n] = min;
                    }
                }
            }
            break;
        }
    }

    // charcodes from 97 to 122 represent letters from 'a' to 'z'
    var id = [97];
    while (Object.keys(b3d.roomsInStack).indexOf(makeLetters(id)) !== -1) {
        increment(id, 97, 122);
    }
    return makeLetters(id);
}

function initMeshTemplates() {
    var meshTemplates = {};
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
        }, b3d.scene);
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
    }, b3d.scene);
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
    }, b3d.scene);
    // in case of rotation have to transform geometry or it will affect positions of its children
    transformGeometry(planeMesh, BABYLON.Matrix.RotationX(Math.PI));
    planeMesh.isVisible = false;
    meshTemplates.plane = planeMesh;
    planeMesh.doNotSyncBoundingInfo = true;
    meshTemplates.billboard = planeMesh.clone('billboard');

    // wedge
    var wedgeMesh = new BABYLON.Mesh("wedgeMesh", b3d.scene);
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
    var emptyMesh = new BABYLON.Mesh("emptyMesh", b3d.scene);
    meshTemplates.empty = emptyMesh;
    return meshTemplates;
}


function room3dOnClick (e) {
    editor3d.cursor.isMouseDown = false;
    // continue updating cursor after moving the camera
    editor3d.cursor.shouldUpdate = true;

    // do editor actions logic here
    if (!editor3d.cursor.isValid) return;
    if (editor3d.cursor.mode === editor3d.CursorModes.Add) {
        // console.log('going to add new drawing now!');
        // console.log('curRoomId: ' + editor3d.cursor.curRoomId);
        // console.log(drawing);
        // return if there is no currently selected drawing
        if (!bitsy.drawing) return;

        if (!editor3d.cursor.curRoomId) {
            // see if the cursor points to an existing room or a new room should be added
            // if a new room should be added, create it and update the curRoomId on the cursor
            // also make sure new room is integrated in the current stack data

            // if current room is a stray room without a stack, new stack should be created
            // and the current room should be added to it
            if (!b3d.curStack) {
                b3d.curStack = newStackId();
                addRoomToStack(bitsy.curRoom, b3d.curStack, 0);
            }

            // note: this function sets bitsy.curRoom to newly created room
            bitsy.newRoom();
            var newRoomId = bitsy.curRoom;
            addRoomToStack(newRoomId, b3d.curStack, editor3d.cursor.mesh.position.y);
            editor3d.cursor.curRoomId = newRoomId;
        }

        if (bitsy.drawing.type === bitsy.TileType.Tile) {
            // console.log('adding new tile');
            bitsy.room[editor3d.cursor.curRoomId].tilemap[editor3d.cursor.roomY][editor3d.cursor.roomX] = bitsy.drawing.id;
        } else if (bitsy.drawing.type === bitsy.TileType.Sprite || bitsy.drawing.type === bitsy.TileType.Avatar) {
            var s = bitsy.sprite[bitsy.drawing.id];
            s.room = editor3d.cursor.curRoomId;
            s.x = editor3d.cursor.roomX;
            s.y = editor3d.cursor.roomY;

            // if there already is a mesh for this sprite, move it accordingly
            var mesh = b3d.sprites[bitsy.drawing.id];
            if (mesh) {
                mesh.position = editor3d.cursor.mesh.position;
                // make sure to reapply additional transformation from tags
                applyTransformTags(s, mesh);
                // update bitsyOrigin object to make sure mouse picking will work correctly
                mesh.bitsyOrigin.x = s.x;
                mesh.bitsyOrigin.y = s.y;
                mesh.bitsyOrigin.roomId = s.room;
            }
        } else if (bitsy.drawing.type === bitsy.TileType.Item) {
            bitsy.room[editor3d.cursor.curRoomId].items.push({
                id: bitsy.drawing.id,
                x: editor3d.cursor.roomX,
                y: editor3d.cursor.roomY,
            });
        }
        bitsy.selectRoom(editor3d.cursor.curRoomId);
        bitsy.refreshGameData();
    // if cursor mode is 'select' or 'remove' picked mesh is not falsy
    } else if (editor3d.cursor.pickedMesh) {
        // ref in global variable for debug
        editor3d.curSelectedMesh = editor3d.cursor.pickedMesh;

        // as the children tag currently does, assume that children can't be nested
        try {
            var bitsyOrigin = editor3d.cursor.pickedMesh.bitsyOrigin || editor3d.cursor.pickedMesh.parent.bitsyOrigin;
        } catch (err) {
            console.error("picked mesh doesn't have a bitsyOrigin");
            console.log(editor3d.cursor.pickedMesh);
            return;
        }

        console.log('bitsy origin:');
        console.log(bitsyOrigin);

        bitsy.selectRoom(bitsyOrigin.roomId);

        // i could infer what drawing it is from the position of the cursor
        // but there could be cases when a mesh can be pushed outside of its bitsy cell using transform tags
        // or when there are several rooms in the stack positioned at the same level
        // would be more robust to attach the data about it's exact bitsy context to the mesh object
        // when the mesh is created and read it here
        if (editor3d.cursor.mode === editor3d.CursorModes.Select) {
            // call the function that bitsy calls when alt-clicking
            // this function relies on bitsy.curRoom to find the drawing
            bitsy.editDrawingAtCoordinate(bitsyOrigin.x, bitsyOrigin.y);
        } else {
            // remove selected drawing from the room data or move sprite
            var id = bitsyOrigin.drawing.id;
            switch (bitsyOrigin.drawing.drw.slice(0, 3)) {
                case 'SPR':
                    if (bitsy.playerId === drawing.id) {
                        return;
                    }
                    bitsyOrigin.drawing.room = null;
                    bitsyOrigin.drawing.x = -1;
                    bitsyOrigin.drawing.y = -1;
                    // clean up 3d hack's 'b3d.sprites'
                    b3d.sprites[id].dispose();
                    b3d.sprites[id] = null;
                    delete b3d.sprites[id];
                    break;
                case 'ITM':
                    var roomItems = bitsy.room[bitsyOrigin.roomId].items;
                    var itemIndex = roomItems.findIndex(function(i) {
                        return i.id === id &&
                            i.x === bitsyOrigin.x &&
                            i.y === bitsyOrigin.y;
                    });
                    if (itemIndex !== -1) {
                        roomItems.splice(itemIndex, 1);
                    } else {
                        console.error("can't find an item to remove");
                        return;
                    }
                    break;
                case 'TIL':
                    bitsy.room[bitsyOrigin.roomId].tilemap[bitsyOrigin.y][bitsyOrigin.x] = '0';
                    break;
            }
            bitsy.refreshGameData();
        }
    }
    bitsy.roomTool.drawEditMap();
    bitsy.updateRoomName();
} // room3dOnClick

function updateCursor(pickInfo) {
    // assume that cursor isn't in the valid position unless it is proved to be different
    editor3d.cursor.isValid = false;
    editor3d.cursor.mesh.isVisible = false;
    editor3d.cursor.curRoomId = undefined;

    if (!pickInfo || !pickInfo.hit) return;
    var mesh = pickInfo.pickedMesh;
    var faceId = pickInfo.faceId;
    var point = pickInfo.pickedPoint;

    // var meshName = mesh.name || mesh.sourceMesh.source.name;
    // console.log('id: ' + mesh.id + ', source mesh: ' + meshName + ', faceId: ' + faceId);
    // console.log(mesh);

    if (editor3d.cursor.mode === editor3d.CursorModes.Add) {
        // console.log('cursor mode: add');
        editor3d.cursor.mesh.material.ambientColor = editor3d.CursorColors.Green;
        // figure out the normal manually, because babylon's built in method doesn't work for wedges
        // and possibly other custom meshes
        var normal = getNormal(mesh, faceId);
        // console.log('face normal: ' + normal.asArray().map(i => ' ' + i.toFixed(1)));
        // console.log('picked point: ' + point.asArray().map(i => ' ' + i.toFixed(1)));

        // improve cursor resolution for floors, planes, billboards etc
        // so that it's always placed between the object you are hovering over and the camera
        // use dot product to find out if the normal faces in similar direction with the ray
        // and flip it if it does
        var dotProduct = BABYLON.Vector3.Dot(pickInfo.ray.direction, normal);
        var cursorPos = point.add(normal.scale(0.75 * -Math.sign(dotProduct)));

        var cursorPosRounded = BABYLON.Vector3.FromArray(cursorPos.asArray().map(function(i) {return Math.round(i);}));
        // console.log('cursorPosRounded: ' + cursorPosRounded);

        editor3d.cursor.mesh.position = cursorPosRounded;

        // figure out the corresponding bitsy cell
        editor3d.cursor.roomX = editor3d.cursor.mesh.position.x;
        editor3d.cursor.roomY = bitsy.mapsize - 1 - editor3d.cursor.mesh.position.z;
        // console.log('roomX: ' + editor3d.cursor.roomX + ' roomY: ' + editor3d.cursor.roomY);

        // make sure that the cursor isn't out of bounds
        // if it is, don't draw the 3d cursor and make sure drawing can't be added to the b3d.scene
        if (!(editor3d.cursor.roomX * (editor3d.cursor.roomX-15) <= 0) || !(editor3d.cursor.roomY * (editor3d.cursor.roomY-15) <= 0)) {
            // console.log("can't place the cursor: coordinates are out of bounds");
            return;
        }

        // figure out if there is an existing room in the stack at appropriate level
        editor3d.cursor.curRoomId = b3d.curStack && b3d.roomsInStack[b3d.curStack].find(function(roomId) {
            return b3d.stackPosOfRoom[roomId].pos === editor3d.cursor.mesh.position.y;
        }) || (editor3d.cursor.mesh.position.y === 0) && bitsy.curRoom;

        // console.log('editor3d.cursor.curRoomId: ' + editor3d.cursor.curRoomId);

        // if the cursor resolves into an existing room,
        // check if the space in this room is already occupied
        // check if there is an empty space for a tile and for item/sprite
        // return depending on what type of the drawing is currently selected as a brush
        if (editor3d.cursor.curRoomId && !canPlaceDrawing(room[editor3d.cursor.curRoomId], editor3d.cursor.roomX, editor3d.cursor.roomY)) {
            // console.log("can't place the cursor: the cell isn't empty");
            return;
        }

        editor3d.cursor.isValid = true;
        editor3d.cursor.mesh.isVisible = true;

    } else if (editor3d.cursor.mode === editor3d.CursorModes.Remove || editor3d.cursor.mode === editor3d.CursorModes.Select) {
        if (editor3d.cursor.mode === editor3d.CursorModes.Remove) {
            // console.log('cursor mode: remove');
            editor3d.cursor.mesh.material.ambientColor = editor3d.CursorColors.Red;
        } else if (editor3d.cursor.mode === editor3d.CursorModes.Select) {
            // console.log('cursor mode: select');
            editor3d.cursor.mesh.material.ambientColor = editor3d.CursorColors.Gray;
        }

        editor3d.cursor.mesh.position = mesh.absolutePosition;

        editor3d.cursor.pickedMesh = mesh;

        editor3d.cursor.isValid = true;
        editor3d.cursor.mesh.isVisible = true;
    }
}

function canPlaceDrawing(room, x, y) {
    // use 3d hack's 'b3d.sprites' object that already keeps track of
    // all b3d.sprites that are currently in the b3d.scene
    if (bitsy.drawing.type === TileType.Tile) {
        return room.tilemap[y][x] === '0';
    } else {
        return !room.items.find(function(i) {return i.x === x && i.y === y;}) &&
            !Object.keys(b3d.sprites).find(function(id) {
                var s = bitsy.sprite[id]
                return s.room === room.id && s.x === x && s.y === y;
            });
    }
}

function getNormal(mesh, faceId) {
    var indices = mesh.getIndices();
    var i0 = indices[faceId * 3];
    var i1 = indices[faceId * 3 + 1];
    var i2 = indices[faceId * 3 + 2];

    // console.log('indices: ' + i0 + ', ' + i1 + ', ' + i2);
    // now get the vertices
    // console.log('data kinds:');
    // console.log(mesh.getVerticesDataKinds());

    var vertexBuf = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind, false);
    // console.log('vertexBuf:');
    // console.log(vertexBuf);

    // TODO:
    // gotta optimize this a big deal
    // since it would be an operation to be preformed quite frequently
    // perhaps cache it or store normal data for each mesh when they are added to the b3d.scene
    // i wonder what would be faster
    // if i still would call it every time at least reuse the vectors instead of creating new ones
    // or use variables for each number. idk what would be more effecient. would be interesting to run tests
    // or just attach the normal data to every mesh as an array where indices are the facet indices
    // and elements are Vector3. like mesh.faceNormals[0] would correspond to faceId 0 and so on
    var p0 = new BABYLON.Vector3(vertexBuf[i0 * 3], vertexBuf[i0 * 3 + 1], vertexBuf[i0 * 3 + 2]);
    var p1 = new BABYLON.Vector3(vertexBuf[i1 * 3], vertexBuf[i1 * 3 + 1], vertexBuf[i1 * 3 + 2]);
    var p2 = new BABYLON.Vector3(vertexBuf[i2 * 3], vertexBuf[i2 * 3 + 1], vertexBuf[i2 * 3 + 2]);

    // console.log('points: ' + p0 + ', ' + p1 + ', ' + p2);
    // console.log(p0);

    // if i'm going to reuse them use subtractToRef(otherVector: DeepImmutable<Vector3>, result: Vector3): Vector3
    var tempVec0 = p0.subtract(p1);
    var tempVec1 = p0.subtract(p2);

    // var normal = tempVec0.cross(tempVec1);
    // wtf... Vector3.cross is undefined even though it's in documentation
    // this is so fucking weird and frustrating
    // hopefully the static version will work
    // tempVec1, tempVec0 order seems to be correct
    var normal = BABYLON.Vector3.Cross(tempVec1, tempVec0);
    normal.normalize();

    BABYLON.Vector3.TransformNormalToRef(normal, mesh.getWorldMatrix(), normal);
    // console.log('transformed by world matrix: ' + normal);

    return normal;
}

function render3d() {
    room3dUpdate();

    // update cursor
    if (editor3d.cursor.shouldUpdate) {
        updateCursor(b3d.scene.pick(
            b3d.scene.pointerX, b3d.scene.pointerY,
            function(m) {
                if (editor3d.cursor.mode !== editor3d.CursorModes.Add) {
                    return m.isVisible && m.isPickable && m !== editor3d.groundMesh;
                } else {
                    return m.isVisible && m.isPickable;
                }
            }));
    }

    b3d.scene.render();
}

// to adjust vertices on the mesh
function transformGeometry(mesh, matrix) {
    var vertData = BABYLON.VertexData.ExtractFromMesh(mesh);
    vertData.transform(matrix);
    vertData.applyToMesh(mesh);
}

// cache helper
function getCache(cacheName, make) {
    var cache = {};
    b3d.caches[cacheName] = cache;
    return function (id, args) {
        var cached = cache[id];
        if (cached) {
            return cached;
        }
        cached = cache[id] = make.apply(undefined, args);
        return cached;
    };
}

var getTextureFromCache = getCache('tex', function(drawing, pal) {
    var canvas = bitsy.renderer.GetImage(drawing, pal);
    var ctx = canvas.getContext('2d');

    var tex = new BABYLON.DynamicTexture('test', {
        width: canvas.width,
        height: canvas.height,
    }, b3d.scene, false, BABYLON.Texture.NEAREST_NEAREST_MIPNEAREST);

    tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

    if (b3d.isTransparent(drawing)) {
        tex.hasAlpha = true;
        // from transparent b3d.sprites hack
        // redraw image context with all bg pixels transparent
        var data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var bg = bitsy.getPal(pal)[0];
        for (let i = 0; i < data.data.length; i += 4) {
            var r = data.data[i];
            var g = data.data[i + 1];
            var b = data.data[i + 2];
            if (r === bg[0] && g === bg[1] && b === bg[2]) {
                data.data[i + 3] = 0;
            }
        }
        ctx.putImageData(data, 0, 0);
    }
    var texCtx = tex.getContext();
    texCtx.drawImage(canvas, 0, 0);
    tex.update();
    return tex;
});

function getTexture(drawing, pal) {
    if (room3dPanel.gamePreviewMode) {
        // handle drawing replacement tag
        var altDrawing = parseDrawTag(drawing);
        drawing = altDrawing && altDrawing || drawing;
    }

    var drw = drawing.drw;
    var col = drawing.col;
    var frame = drawing.animation.frameIndex;
    var key = `${drw},${frame},${col},${pal}`;
    return getTextureFromCache(key, [drawing, pal]);
}

var getMaterialFromCache = getCache('mat', function (drawing, pal) {
    var mat = b3d.baseMat.clone();
    mat.diffuseTexture = getTexture(drawing, pal);
    mat.freeze();
    return mat;
});

function getMaterial(drawing, pal) {
    var drw = drawing.drw;
    var col = drawing.col;
    var frame = drawing.animation.frameIndex;
    var key = `${drw},${frame},${col},${pal}`;
    return getMaterialFromCache(key, [drawing, pal]);
}

var getMeshFromCache = getCache('mesh', function (drawing, pal, type) {
    var mesh = b3d.meshTemplates[type].clone();
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
    var type = b3d.getMeshType(drawing);
    var drw = drawing.drw;
    var col = drawing.col;
    var frame = drawing.animation.frameIndex;
    // include type in the key to account for cases when drawings that link to
    // the same 'drw' need to have different types when using with other hacks
    var key = `${drw},${frame},${col},${pal},${type}`;
    return getMeshFromCache(key, [drawing, pal, type]);
}

function removeFromCaches(cachesArr, drw, frame, col, pal) {
    var r = new RegExp(`${drw || '\\D\\D\\D_\\w+?'},${frame || '\\d*?'},${col || '\\d*?'},${pal || '\\d*'}`);
    cachesArr.forEach(function(cache) {
        Object.keys(cache)
            .filter(function(key) {return r.test(key);})
            .forEach(function(key) {
                cache[key].dispose();
                delete cache[key];
            });
    });
}

function updateColor(pal) {
    removeFromCaches(Object.values(b3d.caches), null, null, null, pal);
}

function updateTexture(drw, frame) {
    removeFromCaches(Object.values(b3d.caches), drw, frame, null, null);
}

function room3dUpdate() {
    // console.log("update called");
    b3d.curStack = b3d.stackPosOfRoom[bitsy.curRoom] && b3d.stackPosOfRoom[bitsy.curRoom].stack || null;

    // sprite changes
    Object.entries(b3d.sprites).forEach(function (entry) {
        var id = entry[0];
        var mesh = entry[1];
        var s = bitsy.sprite[id];
        if (s && isRoomVisible(s.room)) {
        // if the sprite still exits, is in the current room or in the current stack
        // update sprite's position
            mesh.position.x = s.x;
            mesh.position.z = bitsy.mapsize - 1 - s.y;
            mesh.position.y = b3d.curStack && b3d.stackPosOfRoom[s.room].pos || 0;
            mesh.bitsyOrigin.x = s.x;
            mesh.bitsyOrigin.y = s.y;
            mesh.bitsyOrigin.roomId = s.room;
            applyTransformTags(s, mesh);
        } else {
        // otherwise remove the sprite
            mesh.dispose();
            mesh = null;
            delete b3d.sprites[id];
        }
    });
    Object.values(bitsy.sprite).filter(function (s) {
        // go through bitsy b3d.sprites and get those that should be currently displayed
        return isRoomVisible(s.room);
    }).forEach(function (s) {
        var id = s.id;
        var oldMesh = b3d.sprites[id];
        var newMesh = getMesh(s, bitsy.curPal());
        if (newMesh !== (oldMesh && oldMesh.sourceMesh)) {
            if (oldMesh) {
                oldMesh.dispose();
            }
            newMesh = addMeshInstance(newMesh, s, s.room, s.x, s.y);
            b3d.sprites[id] = oldMesh = newMesh;
        }
    });

    // item changes
    // delete irrelevant b3d.items
    Object.entries(b3d.items).forEach(function (entry) {
        var roomId = entry[0].slice(0, entry[0].indexOf(','));
        if (isRoomVisible(roomId)) {
            // if this item is in the current stack
            // check if it is still listed in its room
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
        delete b3d.items[entry[0]];
    });

    // make/update relevant b3d.items
    (b3d.roomsInStack[b3d.curStack] || [bitsy.curRoom]).forEach(function (roomId) {
        bitsy.room[roomId].items.forEach(function (roomItem) {
            var key = `${roomId},${roomItem.id},${roomItem.x},${roomItem.y}`;
            var item = bitsy.item[roomItem.id];
            var oldMesh = b3d.items[key];
            var newMesh = getMesh(item, bitsy.curPal());
            if (newMesh !== (oldMesh && oldMesh.sourceMesh)) {
                if (oldMesh) {
                    oldMesh.dispose();
                }
                newMesh = addMeshInstance(newMesh, item, roomId, roomItem.x, roomItem.y);
                b3d.items[key] = newMesh;
            }
        });
    });

    // updated b3d.tiles logic
    // first clear the b3d.tiles from rooms that should not be currently displayed
    Object.keys(b3d.tiles)
        .filter(function(roomId) { return !isRoomVisible(roomId) })
        .forEach(function(roomId) {
            b3d.tiles[roomId].forEach(function (row) {
                row.forEach(function (tileMesh) {
                    if (tileMesh !== null) {
                        tileMesh.dispose();
                    }
                });
            });
            delete b3d.tiles[roomId];
        });

    // iterate throught tilemaps of rooms in the current stack
    // and update 3d b3d.scene objects accordingly
    (b3d.roomsInStack[b3d.curStack] || [bitsy.curRoom]).forEach(function (roomId) {
        if (!b3d.tiles[roomId]) {
            // generate empty 2d array for meshes
            b3d.tiles[roomId] = bitsy.room[roomId].tilemap.map(function(row) {
                return row.map(function(tileId) {
                    return null;
                });
            });
        }
        bitsy.room[roomId].tilemap.forEach(function(row, y) {
            row.forEach(function(tileId, x) {
                var oldMesh = b3d.tiles[roomId][y][x];
                var newMesh = null;
                if (tileId !== '0') {
                    newMesh = getMesh(bitsy.tile[tileId], bitsy.curPal());
                }
                if (oldMesh !== newMesh && (newMesh !== (oldMesh && oldMesh.sourceMesh)))  {
                    if (oldMesh) {
                        oldMesh.dispose();
                    }
                    if (newMesh) {
                        newMesh = addMeshInstance(newMesh, bitsy.tile[tileId], roomId, x, y);
                    }
                    b3d.tiles[roomId][y][x] = newMesh;
                }
            });
        });
    });

    // bg changes
    b3d.scene.clearColor = getColor(b3d.clearColor);
    b3d.scene.fogColor = getColor(b3d.fogColor);
}

function isRoomVisible(roomId) {
    // true if the room is the current room or we are in the stack and the room is not a stray room and is in the current stack
    return roomId === bitsy.curRoom || b3d.curStack && b3d.stackPosOfRoom[roomId] && b3d.stackPosOfRoom[roomId].stack === b3d.curStack;
}

function addMeshInstance(mesh, drawing, roomId, x, y) {
    instance = mesh.createInstance();
    instance.position.x = x;
    instance.position.z = bitsy.mapsize - 1 - y;
    instance.position.y = b3d.stackPosOfRoom[roomId] && b3d.stackPosOfRoom[roomId].pos || 0;

    // // 3d editor addition:
    // // bitsyOrigin property to correctly determine corresponding bitsy drawing when mouse-picking
    instance.bitsyOrigin = {
        drawing: drawing,
        x: x,
        y: y,
        roomId: roomId,
    };

    b3d.meshExtraSetup(drawing, instance);

    return instance;
}

function getColor(colorId) {
    var col = bitsy.palette[bitsy.curPal()].colors[colorId];
    return new BABYLON.Color3(
        col[0] / 255,
        col[1] / 255,
        col[2] / 255
    );
}

function applyTransformTags(drawing, mesh) {
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

    function radians(degrees) {
        return degrees * Math.PI / 180;
    }
}

function applyChildrenTag(drawing, mesh) {
    var name = drawing.name || '';
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

        // add specified drawings to the b3d.scene as child meshes
        children.forEach(function(childDrawing) {
            var childMesh = getMesh(childDrawing, bitsy.curPal());
            childMesh = childMesh.createInstance();
            childMesh.position.x = mesh.position.x;
            childMesh.position.y = mesh.position.y;
            childMesh.position.z = mesh.position.z;
            mesh.addChild(childMesh);
            b3d.meshExtraSetup(childDrawing, childMesh);
            // for editor version of the 3d hack allow all child meshes to move with their parent
            childMesh.unfreezeWorldMatrix();
        });
    }
}

function parseDrawTag(drawing) {
    // replace drawings marked with the #draw(TYPE,id) tag
    var name = drawing.name || '';
    var tag = name.match(/#draw\((TIL|SPR|ITM),([a-zA-Z0-9]+)\)/);
    if (tag) {
        var map;
        // tag[1] is the first capturing group, it can be either TIL, SPR, or ITM
        switch (tag[1]) {
            case 'TIL':
                map = bitsy.tile;
                break;
            case 'SPR':
                map = bitsy.sprite;
                break;
            case 'ITM':
                map = bitsy.item;
                break;
            default:
                break;
        }
        // tag[2] is the second capturing group which returns drawing id
        var id = tag[2];
        var newDrawing = map[id];
        if (newDrawing) {
            return newDrawing;
        } else {
            console.error(`couldn't replace ${drawing.name}! there is no '${tag[1]} ${id}'`);
        }
    }
}

b3d.isTransparent = function (drawing) {
    var name = drawing.name || '';
    var match = name.match(/#transparent\(((true)|(false))\)/);
    if (match) {
        // 2nd capturing group reserved for 'true' will be undefined if the input said 'false'
        return Boolean(match[2]);
    }
    return b3d.getDefaultTransparency(drawing);
};

b3d.getDefaultTransparency = function (drawing) {
    return !drawing.drw.includes('TIL');
};

b3d.getMeshType = function (drawing) {
    var name = drawing.name || '';
    var meshMatch = name.match(/#mesh\((.+?)\)/);
    if (meshMatch) {
        if (b3d.meshTemplates[meshMatch[1]]) {
            // editor addition: ignore empty mesh tag if not in the game preview mode
            if (room3dPanel.gamePreviewMode || meshMatch[1] !== 'empty') {
                return meshMatch[1];
            }
        } else {
            // if the specified mesh template doesn't exist,
            // display error message, but continue execution
            // to resolve the mesh with default logic
            console.error(`mesh template '${meshMatch[1]}' wasn't found`);
        }
    }
    return b3d.getDefaultMeshType(drawing);
}

b3d.getDefaultMeshType = function (drawing) {
    if (drawing.id === bitsy.playerId) {
        return 'plane';
    }
    if (drawing.drw.startsWith('ITM')) {
        return 'plane';
    }
    if (drawing.drw.startsWith('SPR')) {
        return 'billboard';
    }
    if (drawing.isWall) {
        return 'box';
    }
    return 'floor';
}

b3d.getBillboardMode = function () {
    return BABYLON.TransformNode.BILLBOARDMODE_Y | BABYLON.TransformNode.BILLBOARDMODE_Z;
};

b3d.meshExtraSetup = function (drawing, mesh) {
    applyChildrenTag(drawing, mesh);
    applyTransformTags(drawing, mesh);
    if (mesh.sourceMesh.source.name === 'billboard') {
        mesh.billboardMode = b3d.getBillboardMode();
    } else if (!drawing.drw.startsWith('SPR')) {
        mesh.freezeWorldMatrix();
    }
};

// UI
// controls for editor panel
var room3dPanel = {
    // when false, replace drawing tags won't be applied,
    // and drawings set to have empty meshes will have they regular visible meshes
    gamePreviewMode: true,

    selectAdjacent: function(direction) {
        // direction should be 1 or -1
        // get every first room from every stack and then every stray room
        // and make a list of all rooms we can switch between
        var eligibleRooms = Object.values(b3d.roomsInStack)
            .map(function(roomList) {
                return roomList[0]; 
            })
            .concat(Object.keys(bitsy.room).filter(function(roomId){
                return !b3d.stackPosOfRoom[roomId];
            }));
        var curIdx;
        if (b3d.curStack) {
            curIdx = Object.keys(b3d.roomsInStack).indexOf(b3d.curStack);
        } else {
            curIdx = eligibleRooms.indexOf(bitsy.curRoom);
        }
        var nextIdx = (curIdx + direction) % eligibleRooms.length;
        if (nextIdx < 0) {
            nextIdx = eligibleRooms.length - 1;
        }
        bitsy.selectRoom(eligibleRooms[nextIdx]);
    },

    duplicate: function() {
        var roomList = b3d.curStack && b3d.roomsInStack[b3d.curStack] || [bitsy.curRoom];
        b3d.curStack = b3d.curStack && newStackId() || null;
        roomList.forEach(function(roomId) {
            bitsy.selectRoom(roomId);
            try {
                bitsy.duplicateRoom();
            } catch (err) {
                // todo: fix that bug in bitsy code? idk
            }
            if (b3d.curStack) {
                addRoomToStack(bitsy.curRoom, b3d.curStack, b3d.stackPosOfRoom[roomId].pos);
            }
        });
    },

    delete: function() {
        if (b3d.curStack) {
            if (Object.keys(b3d.roomsInStack).length <= 1 ) {
                alert("You can't delete your only stack!");
                return;
            } else if (!confirm("Are you sure you want to delete this room stack? You can't get it back.")) {
                return;
            }
            // make a copy of the list of rooms to be deleted
            var roomList = b3d.roomsInStack[b3d.curStack].slice();
            roomList.forEach(function(roomId) {
                // delete exits in _other_ rooms that go to this room
                for(r in bitsy.room ) {
                    if(r != roomId) {
                        for(i in bitsy.room[r].exits) {
                            if(bitsy.room[r].exits[i].dest.room === roomId) {
                                bitsy.room[r].exits.splice( i, 1 );
                            }
                        }
                    }
                }
                delete room[roomId];
                unregisterRoomFromStack(roomId);
            });
            bitsy.refreshGameData();

            bitsy.markerTool.Clear();
            // will it work?
            room3dPanel.selectAdjacent(1);

            bitsy.roomTool.drawEditMap();
            bitsy.paintTool.updateCanvas();
            bitsy.updateRoomPaletteSelect();
            bitsy.markerTool.Refresh();
        } else {
            bitsy.deleteRoom();
        }
    },
} // room3dPanel

// set up and respond to ui elements in mesh panel
var meshPanel = {
    subTypePrefixes: ['tower'],

    init: function() {
        // set up type selection
        var meshTypeSelectEl = document.getElementById('meshTypeSelect');
        var meshSubTypeSelectEl = document.getElementById('meshSubTypeSelect');

        Object.keys(b3d.meshTemplates).forEach(function(templateName) {
            // check if the template name needs to be broken down between two select elements
            meshPanel.subTypePrefixes.forEach(function(p) {
                if (templateName.startsWith(p)) {
                    var suffix = templateName.slice(p.length);
                    var option = document.createElement('option');
                    option.text = option.value = suffix;
                    meshSubTypeSelectEl.add(option);
                    templateName = p;
                }
            });
            
            if (Array.prototype.some.call(meshTypeSelectEl.options, function(o) {return o.text === templateName;})) {
                return;
            }

            var option = document.createElement('option');
            option.text = option.value = templateName;

            meshTypeSelectEl.add(option);
            // todo: set an option as currently selected depending on currently selected drawing
            // abstract into a separate function
            // since this would need to be updated whenever a different drawing is selected
            // option.selected = true;
        });
        meshPanel.onChangeType();
    },

    onChangeType: function() {
        var meshTypeSelectEl = document.getElementById('meshTypeSelect');
        var meshSubTypeSelectEl = document.getElementById('meshSubTypeSelect');

        var curMeshType = meshTypeSelectEl.value;

        meshPanel.subTypePrefixes.forEach(function(p) {
            if (curMeshType.startsWith(p)) {
                meshSubTypeSelectEl.setAttribute('style', 'display:initial;');
                curMeshType += meshSubTypeSelectEl.value;
            } else {
                meshSubTypeSelectEl.setAttribute('style', 'display:none;');
            }
        });

        console.log('meshTypeSelect changed: ' + curMeshType);
    },

    onChangeTransparency: function() {
        // body...
    },

    onToggleTransform: function() {
        if ( document.getElementById('meshTransformCheck').checked ) {
            document.getElementById('meshTransform').setAttribute('style','display:block;');
            document.getElementById('meshTransformCheckIcon').innerHTML = 'expand_more';
        } else {
            document.getElementById('meshTransform').setAttribute('style','display:none;');
            document.getElementById('meshTransformCheckIcon').innerHTML = 'expand_less';
        }
    },

    onToggleChildren: function() {
        if ( document.getElementById('meshChildrenCheck').checked ) {
            document.getElementById('meshChildren').setAttribute('style','display:block;');
            document.getElementById('meshChildrenCheckIcon').innerHTML = 'expand_more';
        } else {
            document.getElementById('meshChildren').setAttribute('style','display:none;');
            document.getElementById('meshChildrenCheckIcon').innerHTML = 'expand_less';
        }
    },
}; // meshPanel
