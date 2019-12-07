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

    meshConfig: {},
    roomsInStack: {},
    stackPosOfRoom: {},
    
    curStack: null,

    sprites: {},
    items: {},
    tiles: {},

    caches: {},

    // when set to true, drawing replacements won't be applied,
    // and drawings set to have empty meshes will have their default visible meshes instead
    debugView: false,
};

b3d.init = function (canvas) {
    b3d.engine = new BABYLON.Engine(canvas, false);
    b3d.scene = new BABYLON.Scene(b3d.engine);
    b3d.scene.ambientColor = new BABYLON.Color3(1, 1, 1);
    b3d.scene.freezeActiveMeshes();

    // create basic resources
    b3d.meshTemplates = b3d.initMeshTemplates();

    // material
    b3d.baseMat = new BABYLON.StandardMaterial('base material', b3d.scene);
    b3d.baseMat.ambientColor = new BABYLON.Color3(1, 1, 1);
    b3d.baseMat.maxSimultaneousLights = 0;
    b3d.baseMat.freeze();

    // watch for browser/canvas resize events
    b3d.engine.setSize(b3d.size.width, b3d.size.height);
    if (b3d.size.auto) {
        b3d.engine.resize();
        window.addEventListener("resize", function () {
            b3d.engine.resize();
        });
    }

    b3d.parseData();
};

// parse data serialized in stack and drawing names
b3d.parseData = function () {
    // register room stacks
    Object.values(bitsy.room).forEach(function (room) {
        var name = room.name || '';
        var tag = name.match(/#stack\(([a-zA-Z]+),(-?\.?\d*\.?\d*)\)/);
        if (tag) {
            b3d.registerRoomInStack(room.id, tag[1], Number(tag[2]) || 0);
        }
    });
    // parse mesh config
    [].concat(Object.values(bitsy.item), Object.values(bitsy.tile), Object.values(bitsy.sprite)).forEach(function (drawing) {
        b3d.meshConfig[drawing.drw] = {
            type: b3d.parseMeshTag(drawing),
            transform: b3d.parseTransformTags(drawing),
            transparency: b3d.parseTransparentTag(drawing),
            replacement: b3d.parseDrawTag(drawing),
            children: b3d.parseChildrenTag(drawing),
        };
    });
};

b3d.registerRoomInStack = function (roomId, stackId, pos) {
    b3d.roomsInStack[stackId] = b3d.roomsInStack[stackId] || [];
    b3d.roomsInStack[stackId].push(roomId);
    b3d.stackPosOfRoom[roomId] = {
        stack: stackId,
        pos: pos,
    };
};

b3d.unregisterRoomFromStack = function (roomId) {
    if (!b3d.stackPosOfRoom[roomId]) return;
    var stackId = b3d.stackPosOfRoom[roomId].stack;
    b3d.roomsInStack[stackId].splice(b3d.roomsInStack[stackId].indexOf(roomId), 1);
    delete b3d.stackPosOfRoom[roomId];
    // delete the stack if it became empty
    if (b3d.roomsInStack[stackId].length === 0) {
        delete b3d.roomsInStack[stackId];
    }
};

// returns the name of the drawing with it's mesh configuration serialized to name tags
// or undefined if no serialization was needed
b3d.serializeMeshAsNameTags = function (drawing) {
    var config = b3d.meshConfig[drawing.drw];
    var tags = '';

    if (config.type !== b3d.getDefaultMeshType(drawing)) {
        tags += `#mesh(${config.type})`;
    }
    if (!config.transform.isIdentity()) {
        var scale = new BABYLON.Vector3();
        var rotation = new BABYLON.Quaternion();
        var translation = new BABYLON.Vector3();

        config.transform.decompose(scale, rotation, translation);

        // adjust weird offsets that are apparently caused by float imprecision
        // it should be consistent with the editor input validation
        // that only allows 5 digits after the decimal point
        var adjusted = [].concat(
            scale.asArray(),
            rotation.toEulerAngles().asArray().map(function(n){return n * 180 / Math.PI}),
            translation.asArray())
            .map(function (n) {
                return Math.round(n * 100000) / 100000;
            });

        if (adjusted[0] !== 1 || adjusted[1] !== 1 || adjusted[2] !== 1) {
            // add spaces between tags
            tags = tags && tags + ' ' || tags;
            tags += `#s(${adjusted.slice(0,3).join()})`;
        }
        if (adjusted[3] !== 0 || adjusted[4] !== 0 || adjusted[5] !== 0) {
            tags = tags && tags + ' ' || tags;
            tags += `#r(${adjusted.slice(3,6).join()})`;
        }
        if (adjusted[6] !== 0 || adjusted[7] !== 0 || adjusted[8] !== 0) {
            tags = tags && tags + ' ' || tags;
            tags += `#t(${adjusted.slice(6).join()})`;
        }

    }
    if (config.transparency !== b3d.getDefaultTransparency(drawing)) {
        tags = tags && tags + ' ' || tags;
        tags += `#transparent(${config.transparency})`;
    }
    if (config.replacement) {
        tags = tags && tags + ' ' || tags;
        tags += `#draw(${config.replacement.drw.split('_')})`;
    }
    if (config.children) {
        tags = tags && tags + ' ' || tags;
        tags += `#children(${config.children.map(function (drawing) {return drawing.drw;})})`;
    }

    if (tags) {
        // first strip all exiting name-tags from the drawing's name
        var newName = drawing.name && drawing.name.replace(/ ?#(mesh|draw|r|t|s|transparent|children)\([^]*?\)/gm, '') || '';
        if (newName && newName[newName.length - 1] !== ' ') {
            newName += ' ';
        }
        newName += tags;
        return newName;
    }
}; // b3d.serializeMeshAsNameTags (drawing)

b3d.initMeshTemplates = function () {
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
        b3d.transformGeometry(boxMesh, BABYLON.Matrix.Translation(0.0, i / 2 - 0.5, 0.0));
        meshTemplates['tower' + i] = boxMesh;
    }
    meshTemplates.box = meshTemplates.tower1;

    // floor
    var floorMesh = BABYLON.MeshBuilder.CreatePlane(`floor`, {
        width: 1,
        height: 1,
    }, b3d.scene);
    // adjust template position so that the instances will be displated correctly
    b3d.transformGeometry(floorMesh, BABYLON.Matrix.Translation(0.0, 0.0, 0.5));
    // have to transform geometry instead of using regular rotation
    // or it will mess up children transforms when using combine tag
    b3d.transformGeometry(floorMesh, BABYLON.Matrix.RotationX(Math.PI/2));
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
    b3d.transformGeometry(planeMesh, BABYLON.Matrix.RotationX(Math.PI));
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
}; // b3d.initMeshTemplates()


// to adjust vertices on the mesh
b3d.transformGeometry = function (mesh, matrix) {
    var vertData = BABYLON.VertexData.ExtractFromMesh(mesh);
    vertData.transform(matrix);
    vertData.applyToMesh(mesh);
};

// cache helper
b3d.getCache = function (cacheName, make) {
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
};

b3d.getTextureFromCache = b3d.getCache('tex', function(drawing, pal) {
    var canvas = bitsy.renderer.GetImage(drawing, pal);
    var ctx = canvas.getContext('2d');

    var tex = new BABYLON.DynamicTexture('test', {
        width: canvas.width,
        height: canvas.height,
    }, b3d.scene, false, BABYLON.Texture.NEAREST_NEAREST_MIPNEAREST);

    tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

    if (b3d.meshConfig[drawing.drw].transparency) {
        tex.hasAlpha = true;
        // from transparent sprites hack
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

b3d.getTexture = function (drawing, pal) {
    if (!b3d.debugView) {
        // apply drawing replacement
        var altDrawing = b3d.meshConfig[drawing.drw].replacement;
        drawing = altDrawing && altDrawing || drawing;
    }
    var drw = drawing.drw;
    var col = drawing.col;
    var frame = drawing.animation.frameIndex;
    var key = `${drw},${frame},${col},${pal}`;
    return b3d.getTextureFromCache(key, [drawing, pal]);
};

b3d.getMaterialFromCache = b3d.getCache('mat', function (drawing, pal) {
    var mat = b3d.baseMat.clone();
    mat.diffuseTexture = b3d.getTexture(drawing, pal);
    mat.freeze();
    return mat;
});

b3d.getMaterial = function (drawing, pal) {
    var drw = drawing.drw;
    var col = drawing.col;
    var frame = drawing.animation.frameIndex;
    var key = `${drw},${frame},${col},${pal}`;
    return b3d.getMaterialFromCache(key, [drawing, pal]);
};

b3d.getMeshFromCache = b3d.getCache('mesh', function (drawing, pal, type) {
    var mesh = b3d.meshTemplates[type].clone();
    mesh.makeGeometryUnique();
    mesh.isVisible = false;
    mesh.material = b3d.getMaterial(drawing, pal);
    // enable vertical tiling for towers
    if (type.startsWith('tower')) {
        mesh.material.diffuseTexture.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    }
    return mesh;
});

b3d.getMesh = function (drawing, pal) {
    var type = b3d.meshConfig[drawing.drw].type;
    var drw = drawing.drw;
    var col = drawing.col;
    var frame = drawing.animation.frameIndex;
    // include type in the key to account for cases when drawings that link to
    // the same 'drw' need to have different types when using with other hacks
    var key = `${drw},${frame},${col},${pal},${type}`;
    return b3d.getMeshFromCache(key, [drawing, pal, type]);
};

b3d.removeFromCaches = function (cachesArr, drw, frame, col, pal) {
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

b3d.updateColor = function (pal) {
    b3d.removeFromCaches(Object.values(b3d.caches), null, null, null, pal);
};

b3d.updateTexture = function (drw, frame) {
    b3d.removeFromCaches(Object.values(b3d.caches), drw, frame, null, null);
};

b3d.update = function () {
    // console.log("update called");
    b3d.curStack = b3d.stackPosOfRoom[bitsy.curRoom] && b3d.stackPosOfRoom[bitsy.curRoom].stack || null;

    // sprite changes
    Object.entries(b3d.sprites).forEach(function (entry) {
        var id = entry[0];
        var mesh = entry[1];
        var s = bitsy.sprite[id];
        if (s && b3d.isRoomVisible(s.room)) {
        // if the sprite still exits, is in the current room or in the current stack
        // update sprite's position
            mesh.position.x = s.x;
            mesh.position.z = bitsy.mapsize - 1 - s.y;
            mesh.position.y = b3d.curStack && b3d.stackPosOfRoom[s.room].pos || 0;
            mesh.bitsyOrigin.x = s.x;
            mesh.bitsyOrigin.y = s.y;
            mesh.bitsyOrigin.roomId = s.room;
        } else {
        // otherwise remove the sprite
            mesh.dispose();
            mesh = null;
            delete b3d.sprites[id];
        }
    });
    Object.values(bitsy.sprite).filter(function (s) {
        // go through bitsy b3d.sprites and get those that should be currently displayed
        return b3d.isRoomVisible(s.room);
    }).forEach(function (s) {
        var id = s.id;
        var oldMesh = b3d.sprites[id];
        var newMesh = b3d.getMesh(s, bitsy.curPal());
        if (newMesh !== (oldMesh && oldMesh.sourceMesh)) {
            if (oldMesh) {
                oldMesh.dispose();
            }
            newMesh = b3d.addMeshInstance(newMesh, s, s.room, s.x, s.y);
            b3d.sprites[id] = oldMesh = newMesh;
        }
    });

    // item changes
    // delete irrelevant b3d.items
    Object.entries(b3d.items).forEach(function (entry) {
        var roomId = entry[0].slice(0, entry[0].indexOf(','));
        if (b3d.isRoomVisible(roomId)) {
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
            var newMesh = b3d.getMesh(item, bitsy.curPal());
            if (newMesh !== (oldMesh && oldMesh.sourceMesh)) {
                if (oldMesh) {
                    oldMesh.dispose();
                }
                newMesh = b3d.addMeshInstance(newMesh, item, roomId, roomItem.x, roomItem.y);
                b3d.items[key] = newMesh;
            }
        });
    });

    // updated b3d.tiles logic
    // first clear the b3d.tiles from rooms that should not be currently displayed
    Object.keys(b3d.tiles)
        .filter(function(roomId) { return !b3d.isRoomVisible(roomId) })
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
                    newMesh = b3d.getMesh(bitsy.tile[tileId], bitsy.curPal());
                }
                if (oldMesh !== newMesh && (newMesh !== (oldMesh && oldMesh.sourceMesh)))  {
                    if (oldMesh) {
                        oldMesh.dispose();
                    }
                    if (newMesh) {
                        newMesh = b3d.addMeshInstance(newMesh, bitsy.tile[tileId], roomId, x, y);
                    }
                    b3d.tiles[roomId][y][x] = newMesh;
                }
            });
        });
    });

    // bg changes
    b3d.scene.clearColor = b3d.getColor(b3d.clearColor);
    b3d.scene.fogColor = b3d.getColor(b3d.fogColor);
}; // b3d.update()

b3d.isRoomVisible = function (roomId) {
    // true if the room is the current room or we are in the stack and the room is not a stray room and is in the current stack
    return roomId === bitsy.curRoom || b3d.curStack && b3d.stackPosOfRoom[roomId] && b3d.stackPosOfRoom[roomId].stack === b3d.curStack;
};

b3d.addMeshInstance = function (mesh, drawing, roomId, x, y) {
    instance = mesh.createInstance();
    instance.position.x = x;
    instance.position.z = bitsy.mapsize - 1 - y;
    instance.position.y = b3d.stackPosOfRoom[roomId] && b3d.stackPosOfRoom[roomId].pos || 0;

    // 3d editor addition:
    // bitsyOrigin property to correctly determine corresponding bitsy drawing when mouse-picking
    instance.bitsyOrigin = {
        drawing: drawing,
        x: x,
        y: y,
        roomId: roomId,
    };

    b3d.meshExtraSetup(drawing, instance);

    return instance;
};

b3d.getColor = function (colorId) {
    var col = bitsy.palette[bitsy.curPal()].colors[colorId];
    return new BABYLON.Color3(
        col[0] / 255,
        col[1] / 255,
        col[2] / 255
    );
};

// returns transform matrix or undefined
b3d.parseTransformTags = function (drawing) {
    var name = drawing.name || '';

    // transform tags. #t(x,y,z): translate (move), #r(x,y,z): rotate, #s(x,y,z): scale
    // #m(1,0,0.5) and #m(1,,.5) are both examples of valid input
    var scaleTag = name.match(/#s\((-?\.?\d*\.?\d*)?,(-?\.?\d*\.?\d*)?,(-?\.?\d*\.?\d*)?\)/) || [];
    var rotateTag = name.match(/#r\((-?\.?\d*\.?\d*)?,(-?\.?\d*\.?\d*)?,(-?\.?\d*\.?\d*)?\)/) || [];
    var translateTag = name.match(/#t\((-?\.?\d*\.?\d*)?,(-?\.?\d*\.?\d*)?,(-?\.?\d*\.?\d*)?\)/) || [];

    var matrix;
    if (scaleTag || rotateTag || translateTag) {
        matrix = BABYLON.Matrix.Compose(
            new BABYLON.Vector3(
                Number(scaleTag[1]) || 1,
                Number(scaleTag[2]) || 1,
                Number(scaleTag[3]) || 1
            ),
            BABYLON.Quaternion.FromEulerAngles(
                (Number(rotateTag[1]) || 0) * Math.PI / 180,
                (Number(rotateTag[2]) || 0) * Math.PI / 180,
                (Number(rotateTag[3]) || 0) * Math.PI / 180
            ),
            new BABYLON.Vector3(
                Number(translateTag[1]) || 0,
                Number(translateTag[2]) || 0,
                Number(translateTag[3]) || 0
            ),
        );
    }

    return matrix;
};

b3d.parseDrawTag = function (drawing) {
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
};

b3d.parseChildrenTag = function (drawing) {
    var children;
    var name = drawing.name || '';
    // children tag
    // for now for animation to work gotta make sure that the parent drawing has as many frames as children
    var childrenTag;
    childrenTag = name.match(/#children\(([\w-, ]+)\)/);
    if (childrenTag) {
        // parse args and get the actual drawings
        children = childrenTag[1].split(/, |,/).map(function(arg) {
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
    }
    return children;
}

b3d.addChildren = function (drawing, mesh) {
    // make sure the mesh we are about to add children to doesn't have a parent on its own to avoid ifinite loops
    if (!mesh.parent && b3d.meshConfig[drawing.drw].children) {
        // add specified drawings to the b3d.scene as child meshes
        b3d.meshConfig[drawing.drw].children.forEach(function(childDrawing) {
            var childMesh = b3d.getMesh(childDrawing, bitsy.curPal());
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
};

b3d.parseTransparentTag = function (drawing) {
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

b3d.parseMeshTag = function (drawing) {
    var name = drawing.name || '';
    var meshMatch = name.match(/#mesh\((.+?)\)/);
    if (meshMatch) {
        if (b3d.meshTemplates[meshMatch[1]]) {
            // ignore empty mesh tag if we are in debug view
            if (!b3d.debugView || meshMatch[1] !== 'empty') {
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
};

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
};

b3d.getBillboardMode = function () {
    return BABYLON.TransformNode.BILLBOARDMODE_Y | BABYLON.TransformNode.BILLBOARDMODE_Z;
};

b3d.meshExtraSetup = function (drawing, mesh) {
    b3d.addChildren(drawing, mesh);
    if (b3d.meshConfig[drawing.drw].transform) {
        mesh.setPreTransformMatrix(b3d.meshConfig[drawing.drw].transform);
    }
    if (mesh.sourceMesh.source.name === 'billboard') {
        mesh.billboardMode = b3d.getBillboardMode();
    } else if (!drawing.drw.startsWith('SPR')) {
        mesh.freezeWorldMatrix();
    }
};
