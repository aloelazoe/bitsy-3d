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

var sprites = {};
var items = {};
var tiles = {};

var CursorModes = {
    Add: 0,
    Remove: 1,
    Select: 2,
};

var CursorColors = {
    Green: new BABYLON.Color3(0, 1, 0.5),
    Red: new BABYLON.Color3(1, 0.3, 0.3),
    Gray: new BABYLON.Color3(1, 1, 1),
};

var cursor = {};
cursor.mesh = null;
cursor.roomX = null;
cursor.roomY = null;
cursor.curRoomId = undefined;
cursor.isValid = false;
cursor.mode = CursorModes.Add;
cursor.shouldUpdate = false;
cursor.pickedMesh = null;
cursor.isMouseDown = false;
cursor.isAltDown = false;
cursor.isShiftDown = false;

// track if cursor mode was modified by holding down alt for switching to select mode
cursor.modeBeforeModified = null;

// debug. set this when clicking on the mesh in select mode
var curSelectedMesh = null;

var groundMesh = null;

var room3dCaches = {};

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

    // make a mesh for 3d cursor
    cursor.mesh = BABYLON.MeshBuilder.CreateBox('cursor', { size: 1.1 }, scene);
    cursor.mesh.isPickable = false;
    var cursorMat = new BABYLON.StandardMaterial("cursorMaterial", scene);
    cursorMat.ambientColor = CursorColors.Green;
    cursorMat.alpha = 0.5;
    cursor.mesh.material = cursorMat;

    // add ground floor mesh
    groundMesh = BABYLON.MeshBuilder.CreatePlane('ground', {
        width: bitsy.mapsize,
        height: bitsy.mapsize,
    }, scene);
    transformGeometry(groundMesh, BABYLON.Matrix.Translation(bitsy.mapsize/2 - 0.5, bitsy.mapsize/2 - 0.5, 0.5));
    transformGeometry(groundMesh, BABYLON.Matrix.RotationX(Math.PI/2));
    var groundMat = new BABYLON.StandardMaterial('ground material', scene);
    groundMat.maxSimultaneousLights = 0;
    groundMat.freeze();
    groundMat.alpha = 0;
    groundMesh.material = groundMat;

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

    initRoomStacks();

    // set the rendering loop function
    engine.runRenderLoop(render3d);

    // add event listeners
    canvas3d.addEventListener('mouseover', function (e) {
        // register 3d cursor update & mouse picking
        cursor.shouldUpdate = true;
    });

    canvas3d.addEventListener('mouseleave', function (e) {
        // unregister 3d cursor update & mouse picking
        cursor.shouldUpdate = false;
    });

    // switch cursor mode when starting to hold alt and shift
    document.addEventListener('keydown', function(e) {
        switch (e.code) {
            case 'AltLeft':
            case 'AltRight':
                cursor.isAltDown = true;
                if (cursor.modeBeforeModified === null) {
                    cursor.modeBeforeModified = cursor.mode;
                    if (cursor.isShiftDown) {
                        cursor.mode = CursorModes.Remove;
                    } else {
                        cursor.mode = CursorModes.Select;
                    }
                }
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                cursor.isShiftDown = true;
                if (cursor.isAltDown && cursor.mode === CursorModes.Select) {
                    cursor.mode = CursorModes.Remove;
                }
                break;
        }
    });

    // switch cursor mode with number keys and when releasing alt and shift
    document.addEventListener('keyup', function(e) {
        switch (e.code) {
            case 'AltLeft':
            case 'AltRight':
                cursor.isAltDown = false;
                if (cursor.modeBeforeModified !== null) {
                    cursor.mode = cursor.modeBeforeModified;
                    cursor.modeBeforeModified = null;
                }
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                cursor.isShiftDown = false;
                if (cursor.isAltDown && cursor.mode === CursorModes.Remove) {
                    cursor.mode = CursorModes.Select;
                }
                break;
        }
    });

    scene.onPointerDown = function (e) {
        cursor.isMouseDown = true;
    };

    scene.onPointerMove = function (e) {
        // don't update the cursor when moving the camera
        if (cursor.shouldUpdate && cursor.isMouseDown) {
            cursor.shouldUpdate = false;
            cursor.isValid = false;
            cursor.mesh.isVisible = false;
        }
    };

    scene.onPointerUp = function (e) {
        cursor.isMouseDown = false;
        // continue updating cursor after moving the camera
        cursor.shouldUpdate = true;

        // do editor actions logic here
        if (!cursor.isValid) return;
        if (cursor.mode === CursorModes.Add) {
            // console.log('going to add new drawing now!');
            // console.log('curRoomId: ' + cursor.curRoomId);
            // console.log(drawing);
            // return if there is no currently selected drawing
            if (!bitsy.drawing) return;

            if (!cursor.curRoomId) {
                // see if the cursor points to an existing room or a new room should be added
                // if a new room should be added, create it and update the curRoomId on the cursor
                // also make sure new room is integrated in the current stack data

                // if current room is a stray room without a stack, new stack should be created
                // and the current room should be added to it
                if (!curStack) {
                    curStack = newStackId();
                    addRoomToStack(bitsy.curRoom, curStack, 0);
                }

                // note: this function sets bitsy.curRoom to newly created room
                bitsy.newRoom();
                var newRoomId = bitsy.curRoom;
                addRoomToStack(newRoomId, curStack, cursor.mesh.position.y);
                cursor.curRoomId = newRoomId;
            }

            if (bitsy.drawing.type === bitsy.TileType.Tile) {
                // console.log('adding new tile');
                bitsy.room[cursor.curRoomId].tilemap[cursor.roomY][cursor.roomX] = bitsy.drawing.id;
            } else if (bitsy.drawing.type === bitsy.TileType.Sprite || bitsy.drawing.type === bitsy.TileType.Avatar) {
                var s = bitsy.sprite[bitsy.drawing.id];
                s.room = cursor.curRoomId;
                s.x = cursor.roomX;
                s.y = cursor.roomY;

                // if there already is a mesh for this sprite, move it accordingly
                var mesh = sprites[bitsy.drawing.id];
                if (mesh) {
                    mesh.position = cursor.mesh.position;
                    // make sure to reapply additional transformation from tags
                    applyTransformTags(s, mesh);
                    // update bitsyOrigin object to make sure mouse picking will work correctly
                    mesh.bitsyOrigin.x = s.x;
                    mesh.bitsyOrigin.y = s.y;
                    mesh.bitsyOrigin.roomId = s.room;
                }
            } else if (bitsy.drawing.type === bitsy.TileType.Item) {
                bitsy.room[cursor.curRoomId].items.push({
                    id: bitsy.drawing.id,
                    x: cursor.roomX,
                    y: cursor.roomY,
                });
            }
            bitsy.selectRoom(cursor.curRoomId);
            bitsy.refreshGameData();
        // if cursor mode is 'select' or 'remove' picked mesh is not falsy
        } else if (cursor.pickedMesh) {
            // ref in global variable for debug
            curSelectedMesh = cursor.pickedMesh;

            // as the children tag currently does, assume that children can't be nested
            try {
                var bitsyOrigin = cursor.pickedMesh.bitsyOrigin || cursor.pickedMesh.parent.bitsyOrigin;
            } catch (err) {
                console.error("picked mesh doesn't have a bitsyOrigin");
                console.log(cursor.pickedMesh);
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
            if (cursor.mode === CursorModes.Select) {
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
                        // clean up 3d hack's 'sprites'
                        sprites[id].dispose();
                        sprites[id] = null;
                        delete sprites[id];
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
    }; // scene.onPointerUp()

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
        roomsInStack = {};
        stackPosOfRoom = {};
        initRoomStacks();
        // clear all caches to force all drawings to reset during the update
        removeFromCaches(Object.values(room3dCaches));
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

// hook up init function
document.addEventListener('DOMContentLoaded', function() {
    var s = bitsy.start;
    bitsy.start = function() {
        s.call();
        initRoom3d();
    };
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
    roomsInStack[stackId] = roomsInStack[stackId] || [];
    roomsInStack[stackId].push(roomId);
    stackPosOfRoom[roomId] = {
        stack: stackId,
        pos: pos,
    };
}

function unregisterRoomFromStack(roomId) {
    if (!stackPosOfRoom[roomId]) return;
    var stackId = stackPosOfRoom[roomId].stack;
    roomsInStack[stackId].splice(roomsInStack[stackId].indexOf(roomId), 1);
    delete stackPosOfRoom[roomId];
    // delete the stack if it became empty
    if (roomsInStack[stackId].length === 0) {
        delete roomsInStack[stackId];
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
    while (Object.keys(roomsInStack).indexOf(makeLetters(id)) !== -1) {
        increment(id, 97, 122);
    }
    return makeLetters(id);
}

function updateCursor(pickInfo) {
    // assume that cursor isn't in the valid position unless it is proved to be different
    cursor.isValid = false;
    cursor.mesh.isVisible = false;
    cursor.curRoomId = undefined;

    if (!pickInfo || !pickInfo.hit) return;
    var mesh = pickInfo.pickedMesh;
    var faceId = pickInfo.faceId;
    var point = pickInfo.pickedPoint;

    // var meshName = mesh.name || mesh.sourceMesh.source.name;
    // console.log('id: ' + mesh.id + ', source mesh: ' + meshName + ', faceId: ' + faceId);
    // console.log(mesh);

    if (cursor.mode === CursorModes.Add) {
        // console.log('cursor mode: add');
        cursor.mesh.material.ambientColor = CursorColors.Green;
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

        cursor.mesh.position = cursorPosRounded;

        // figure out the corresponding bitsy cell
        cursor.roomX = cursor.mesh.position.x;
        cursor.roomY = bitsy.mapsize - 1 - cursor.mesh.position.z;
        // console.log('roomX: ' + cursor.roomX + ' roomY: ' + cursor.roomY);

        // make sure that the cursor isn't out of bounds
        // if it is, don't draw the 3d cursor and make sure drawing can't be added to the scene
        if (!(cursor.roomX * (cursor.roomX-15) <= 0) || !(cursor.roomY * (cursor.roomY-15) <= 0)) {
            // console.log("can't place the cursor: coordinates are out of bounds");
            return;
        }

        // figure out if there is an existing room in the stack at appropriate level
        cursor.curRoomId = curStack && roomsInStack[curStack].find(function(roomId) {
            return stackPosOfRoom[roomId].pos === cursor.mesh.position.y;
        }) || (cursor.mesh.position.y === 0) && bitsy.curRoom;

        // console.log('cursor.curRoomId: ' + cursor.curRoomId);

        // if the cursor resolves into an existing room,
        // check if the space in this room is already occupied
        // check if there is an empty space for a tile and for item/sprite
        // return depending on what type of the drawing is currently selected as a brush
        if (cursor.curRoomId && !canPlaceDrawing(room[cursor.curRoomId], cursor.roomX, cursor.roomY)) {
            // console.log("can't place the cursor: the cell isn't empty");
            return;
        }

        cursor.isValid = true;
        cursor.mesh.isVisible = true;

    } else if (cursor.mode === CursorModes.Remove || cursor.mode === CursorModes.Select) {
        if (cursor.mode === CursorModes.Remove) {
            // console.log('cursor mode: remove');
            cursor.mesh.material.ambientColor = CursorColors.Red;
        } else if (cursor.mode === CursorModes.Select) {
            // console.log('cursor mode: select');
            cursor.mesh.material.ambientColor = CursorColors.Gray;
        }

        cursor.mesh.position = mesh.absolutePosition;

        cursor.pickedMesh = mesh;

        cursor.isValid = true;
        cursor.mesh.isVisible = true;
    }
}

function canPlaceDrawing(room, x, y) {
    // use 3d hack's 'sprites' object that already keeps track of
    // all sprites that are currently in the scene
    if (bitsy.drawing.type === TileType.Tile) {
        return room.tilemap[y][x] === '0';
    } else {
        return !room.items.find(function(i) {return i.x === x && i.y === y;}) &&
            !Object.keys(sprites).find(function(id) {
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
    // perhaps cache it or store normal data for each mesh when they are added to the scene
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
    if (cursor.shouldUpdate) {
        updateCursor(scene.pick(
            scene.pointerX, scene.pointerY,
            function(m) {
                if (cursor.mode !== CursorModes.Add) {
                    return m.isVisible && m.isPickable && m !== groundMesh;
                } else {
                    return m.isVisible && m.isPickable;
                }
            }));
    }

    scene.render();
}

function radians(degrees) {
    return degrees * Math.PI / 180;
}

function applyBehaviours(targetMesh, drawing) {
    hackOptions.meshExtraSetup(drawing, targetMesh);
    if (targetMesh.sourceMesh.source.name === 'billboard') {
        targetMesh.billboardMode = hackOptions.getBillboardMode(BABYLON);
    } else if (!drawing.drw.startsWith('SPR')) {
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
function getCache(cacheName, make) {
    var cache = {};
    room3dCaches[cacheName] = cache;
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
    var c = bitsy.renderer.GetImage(drawing, pal);
    // mock tile draw with palette shenanigans
    // to force transparency to take effect
    var p = bitsy.curPal();
    bitsy.room[bitsy.curRoom].pal = pal;
    bitsy.drawTile(c, 0, 0, fakeContext);
    bitsy.room[bitsy.curRoom].pal = p;

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
    var key = `${drw},${frame},${col},${pal}`;
    return getTextureFromCache(key, [drawing, pal]);
}

var getMaterialFromCache = getCache('mat', function (drawing, pal) {
    var mat = baseMat.clone();
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
    removeFromCaches(Object.values(room3dCaches), null, null, null, pal);
}

function updateTexture(drw, frame) {
    removeFromCaches(Object.values(room3dCaches), drw, frame, null, null);
}

function room3dUpdate() {
    // console.log("update called");
    curStack = stackPosOfRoom[bitsy.curRoom] && stackPosOfRoom[bitsy.curRoom].stack || null;

    // sprite changes
    Object.entries(sprites).forEach(function (entry) {
        var id = entry[0];
        var mesh = entry[1];
        var s = bitsy.sprite[id];
        if (s && isRoomVisible(s.room)) {
        // if the sprite still exits, is in the current room or in the current stack
        // update sprite's position
            mesh.position.x = s.x;
            mesh.position.z = bitsy.mapsize - 1 - s.y;
            mesh.position.y = curStack && stackPosOfRoom[s.room].pos || 0;
            mesh.bitsyOrigin.x = s.x;
            mesh.bitsyOrigin.y = s.y;
            mesh.bitsyOrigin.roomId = s.room;
            applyTransformTags(s, mesh);
        } else {
        // otherwise remove the sprite
            mesh.dispose();
            mesh = null;
            delete sprites[id];
        }
    });
    Object.values(bitsy.sprite).filter(function (s) {
        // go through bitsy sprites and get those that should be currently displayed
        return isRoomVisible(s.room);
    }).forEach(function (s) {
        var id = s.id;
        var oldMesh = sprites[id];
        var newMesh = getMesh(s, bitsy.curPal());
        if (newMesh !== (oldMesh && oldMesh.sourceMesh)) {
            if (oldMesh) {
                oldMesh.dispose();
            }
            newMesh = addMeshInstance(newMesh, s, s.room, s.x, s.y);
            sprites[id] = oldMesh = newMesh;
        }
    });

    // item changes
    // delete irrelevant items
    Object.entries(items).forEach(function (entry) {
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
        delete items[entry[0]];
    });

    // make/update relevant items
    (roomsInStack[curStack] || [bitsy.curRoom]).forEach(function (roomId) {
        bitsy.room[roomId].items.forEach(function (roomItem) {
            var key = `${roomId},${roomItem.id},${roomItem.x},${roomItem.y}`;
            var item = bitsy.item[roomItem.id];
            var oldMesh = items[key];
            var newMesh = getMesh(item, bitsy.curPal());
            if (newMesh !== (oldMesh && oldMesh.sourceMesh)) {
                if (oldMesh) {
                    oldMesh.dispose();
                }
                newMesh = addMeshInstance(newMesh, item, roomId, roomItem.x, roomItem.y);
                items[key] = newMesh;
            }
        });
    });

    // updated tiles logic
    // first clear the tiles from rooms that should not be currently displayed
    Object.keys(tiles)
        .filter(function(roomId) { return !isRoomVisible(roomId) })
        .forEach(function(roomId) {
            tiles[roomId].forEach(function (row) {
                row.forEach(function (tileMesh) {
                    if (tileMesh !== null) {
                        tileMesh.dispose();
                    }
                });
            });
            delete tiles[roomId];
        });

    // iterate throught tilemaps of rooms in the current stack
    // and update 3d scene objects accordingly
    (roomsInStack[curStack] || [bitsy.curRoom]).forEach(function (roomId) {
        if (!tiles[roomId]) {
            // generate empty 2d array for meshes
            tiles[roomId] = bitsy.room[roomId].tilemap.map(function(row) {
                return row.map(function(tileId) {
                    return null;
                });
            });
        }
        bitsy.room[roomId].tilemap.forEach(function(row, y) {
            row.forEach(function(tileId, x) {
                var oldMesh = tiles[roomId][y][x];
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
                    tiles[roomId][y][x] = newMesh;
                }
            });
        });
    });

    // bg changes
    scene.clearColor = getColor(hackOptions.clearColor);
    scene.fogColor = getColor(hackOptions.fogColor);

    // remember what stack we were in in this frame
    lastStack = curStack;
    lastRoom = bitsy.curRoom;
}

function isRoomVisible(roomId) {
    // true if the room is the current room or we are in the stack and the room is not a stray room and is in the current stack
    return roomId === bitsy.curRoom || curStack && stackPosOfRoom[roomId] && stackPosOfRoom[roomId].stack === curStack;
}

function addMeshInstance(mesh, drawing, roomId, x, y) {
    instance = mesh.createInstance();
    instance.position.x = x;
    instance.position.z = bitsy.mapsize - 1 - y;
    instance.position.y = stackPosOfRoom[roomId] && stackPosOfRoom[roomId].pos || 0;

    // // 3d editor addition:
    // // bitsyOrigin property to correctly determine corresponding bitsy drawing when mouse-picking
    instance.bitsyOrigin = {
        drawing: drawing,
        x: x,
        y: y,
        roomId: roomId,
    };

    applyBehaviours(instance, drawing);

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

        // add specified drawings to the scene as child meshes
        children.forEach(function(childDrawing) {
            var childMesh = getMesh(childDrawing, bitsy.curPal());
            childMesh = childMesh.createInstance();
            childMesh.position.x = mesh.position.x;
            childMesh.position.y = mesh.position.y;
            childMesh.position.z = mesh.position.z;
            mesh.addChild(childMesh);
            applyBehaviours(childMesh, childDrawing);
            // for editor version of the 3d hack allow all child meshes to move with their parent
            childMesh.unfreezeWorldMatrix();
        });
    }
}

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
        applyTransformTags(drawing, mesh);
        applyChildrenTag(drawing, mesh);
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

// hook up ui controls for editor panel
function selectAdjacentStackOrStrayRoom(direction) {
    // direction should be 1 or -1
    // get every first room from every stack and then every stray room
    // and make a list of all rooms we can switch between
    var eligibleRooms = Object.values(roomsInStack)
        .map(function(roomList) {
            return roomList[0]; 
        })
        .concat(Object.keys(bitsy.room).filter(function(roomId){
            return !stackPosOfRoom[roomId];
        }));
    var curIdx;
    if (curStack) {
        curIdx = Object.keys(roomsInStack).indexOf(curStack);
    } else {
        curIdx = eligibleRooms.indexOf(bitsy.curRoom);
    }
    var nextIdx = (curIdx + direction) % eligibleRooms.length;
    if (nextIdx < 0) {
        nextIdx = eligibleRooms.length - 1;
    }
    bitsy.selectRoom(eligibleRooms[nextIdx]);
}

function duplicateCurStack() {
    var roomList = curStack && roomsInStack[curStack] || [bitsy.curRoom];
    curStack = curStack && newStackId() || null;
    roomList.forEach(function(roomId) {
        bitsy.selectRoom(roomId);
        try {
            bitsy.duplicateRoom();
        } catch (err) {
            // todo: fix that bug in bitsy code? idk
        }
        if (curStack) {
            addRoomToStack(bitsy.curRoom, curStack, stackPosOfRoom[roomId].pos);
        }
    });
}

function deleteCurStack() {
    if (curStack) {
        if (Object.keys(roomsInStack).length <= 1 ) {
            alert("You can't delete your only stack!");
            return;
        } else if (!confirm("Are you sure you want to delete this room stack? You can't get it back.")) {
            return;
        }
        // make a copy of the list of rooms to be deleted
        var roomList = roomsInStack[curStack].slice();
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
        selectAdjacentStackOrStrayRoom(1);

        bitsy.roomTool.drawEditMap();
        bitsy.paintTool.updateCanvas();
        bitsy.updateRoomPaletteSelect();
        bitsy.markerTool.Refresh();
    } else {
        bitsy.deleteRoom();
    }
}
