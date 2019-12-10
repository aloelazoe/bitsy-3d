var bitsy = window;

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
};

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

editor3d.init = function() {
    var canvas = document.getElementById('room3dCanvas');
    console.log('canvas');
    console.log(canvas);
    canvas.width = 512;
    canvas.height = 512;

    b3d.init(canvas);
    editor3d.suggestReplacingNameTags();

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
    b3d.transformGeometry(editor3d.groundMesh, BABYLON.Matrix.Translation(bitsy.mapsize/2 - 0.5, bitsy.mapsize/2 - 0.5, 0.5));
    b3d.transformGeometry(editor3d.groundMesh, BABYLON.Matrix.RotationX(Math.PI/2));
    var groundMat = new BABYLON.StandardMaterial('ground material', b3d.scene);
    groundMat.maxSimultaneousLights = 0;
    groundMat.freeze();
    groundMat.alpha = 0;
    editor3d.groundMesh.material = groundMat;

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

    camera.attachControl(canvas);

    // set the rendering loop function
    b3d.engine.runRenderLoop(editor3d.update);

    // add event listeners
    canvas.addEventListener('mouseover', function (e) {
        // register 3d cursor update & mouse picking
        editor3d.cursor.shouldUpdate = true;
    });

    canvas.addEventListener('mouseleave', function (e) {
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

    b3d.scene.onPointerUp = editor3d.onPointerUp;

    // update textures when pallete is changed
    bitsy.events.Listen('palette_change', function(event) {
        if (bitsy.paletteTool){
            b3d.updateColor(bitsy.paletteTool.GetSelectedId());
        }
        // console.log('palette change event hiya hey');
    });

    // update texture for the current drawing when editing with paint tool
    // this relies on event listeners being called in order
    // it should work in any browser that implements dom3 events
    document.getElementById('paint').addEventListener('mouseup', function(e) {
        b3d.updateTexture(bitsy.paintTool.getCurObject().drw, bitsy.paintTool.curDrawingFrameIndex);
        console.log('PAINT EVENT');
    });

    bitsy.events.Listen("game_data_change", function() {
        // since there is no way to tell what exactly was changed, reset everything
        // reset stack objects
        b3d.roomsInStack = {};
        b3d.stackPosOfRoom = {};
        b3d.meshConfig = {};
        b3d.parseData();
        editor3d.suggestReplacingNameTags();
        // clear all caches to force all drawings to reset during the update
        b3d.removeFromCaches(Object.values(b3d.caches));
        // this fixes 3d editor crash when removing rooms right after modifying game data
        bitsy.selectRoom(bitsy.curRoom);
    });

    // patch refreshGameData function to include 3d data
    editor3d.patch(bitsy, 'refreshGameData', function () {
        b3d.serializeData();
    });

    // patch delete room function to fix crash when deleting rooms from vanilla room panel
    editor3d.patch(bitsy, 'deleteRoom',
        function () {
            editor3d._patchContext.deletedRoom = bitsy.curRoom;
        },
        function () {
            // check if the room was actually deleted after the dialog
            var deletedRoom = editor3d._patchContext.deletedRoom;
            if (bitsy.curRoom !== deletedRoom) {
                b3d.unregisterRoomFromStack(deletedRoom);
            }
            delete editor3d._patchContext.deletedRoom;
        }
    );
}; // editor3d.init()

// helper function to patch functions
editor3d.patch = function (scope, name, before, after) {
    var original = scope[name];
    var patched = function () {
        if (before) before.apply(scope, arguments);
        var output = original.apply(scope, arguments);
        if (after) after.apply(scope, arguments);
        return output;
    }
    scope[name] = patched;
};
editor3d._patchContext = {};

editor3d.suggestReplacingNameTags = function () {
    // check if name tags are used and ask to delete them: new data format made them redundant 
    var nameTagsRegex = / ?#(stack|mesh|draw|r|t|s|transparent|children)\([^]*?\)/gm;
    var usesNameTags;
    Object.values(bitsy.names).forEach(function (namesMap) {
        namesMap.forEach(function (value, key) {
            usesNameTags = usesNameTags || nameTagsRegex.test(key);
        });
    });
    if (usesNameTags && window.confirm("3d editor uses new format for storing its data. it can read game data made for older versions of 3d hack that relied on name-tags, but it doesn't update existing name-tags when you make changes and prioritizes data in the new format when both kinds are present. you might want to delete name-tags to avoid confusion and make names less cluttered. do you want to delete them?")) {
        [].concat(Object.values(bitsy.room), Object.values(bitsy.tile), Object.values(bitsy.sprite), Object.values(bitsy.item))
        .forEach(function (entity) {
            if (entity.name) {
                entity.name = entity.name.replace(nameTagsRegex, '');
            }
        });
        bitsy.updateNamesFromCurData();
        bitsy.refreshGameData();
    }
};

// initialize 3d editor
document.addEventListener('DOMContentLoaded', function() {
    // hook up init function
    var s = bitsy.start;
    bitsy.start = function() {
        s.call();
        editor3d.init();
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

editor3d.addRoomToStack = function (roomId, stackId, pos) {
    var room = bitsy.room[roomId];
    // var tag = `#stack(${stackId},${pos})`;
    // room.name = room.name && ' ' + tag || tag;
    // bitsy.updateNamesFromCurData();
    b3d.registerRoomInStack(roomId, stackId, pos);
    bitsy.refreshGameData();
};

editor3d.newStackId = function () {
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
};

editor3d.onPointerUp = function (e) {
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
                b3d.curStack = editor3d.newStackId();
                editor3d.addRoomToStack(bitsy.curRoom, b3d.curStack, 0);
            }

            // note: this function sets bitsy.curRoom to newly created room
            bitsy.newRoom();
            var newRoomId = bitsy.curRoom;
            editor3d.addRoomToStack(newRoomId, b3d.curStack, editor3d.cursor.mesh.position.y);
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
                // todo: won't be necessary soon
                // b3d.applyTransformTags(s, mesh);
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
}; // editor3d.onPointerUp()

editor3d.updateCursor = function (pickInfo) {
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
        var normal = editor3d.getNormal(mesh, faceId);
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
        if (editor3d.cursor.curRoomId && !editor3d.canPlaceDrawing(room[editor3d.cursor.curRoomId], editor3d.cursor.roomX, editor3d.cursor.roomY)) {
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
}; // editor3d.updateCursor()

editor3d.canPlaceDrawing = function (room, x, y) {
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
};

editor3d.getNormal = function (mesh, faceId) {
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
}; // editor3d.getNormal()

editor3d.update = function () {
    b3d.update();

    // update cursor
    if (editor3d.cursor.shouldUpdate) {
        editor3d.updateCursor(b3d.scene.pick(
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
};

// UI
// controls for editor panel
var room3dPanel = {
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
        b3d.curStack = b3d.curStack && editor3d.newStackId() || null;
        roomList.forEach(function(roomId) {
            bitsy.selectRoom(roomId);
            try {
                bitsy.duplicateRoom();
            } catch (err) {
                // todo: fix that bug in bitsy code? idk
            }
            if (b3d.curStack) {
                editor3d.addRoomToStack(bitsy.curRoom, b3d.curStack, b3d.stackPosOfRoom[roomId].pos);
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
                b3d.unregisterRoomFromStack(roomId);
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
}; // room3dPanel

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
