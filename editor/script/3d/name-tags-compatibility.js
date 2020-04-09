// add compatibility with name-tags from 3d hack
b3d.parseData = function () {
    if (!b3d.parseDataFromDialog()) {
        b3d.parseDataFromNameTags();
    }
}

// parse data serialized in stack and drawing names
b3d.parseDataFromNameTags = function () {
    // register room stacks
    Object.values(bitsy.room).forEach(function (room) {
        var name = room.name || '';
        var tag = name.match(/#stack\(([a-zA-Z]+),(-?\.?\d*\.?\d*)\)/);
        if (tag) {
            b3d.registerRoomInStack(room.id, tag[1], Number(tag[2]) || 0);
        }
    });
    // parse mesh config
    [].concat(Object.values(bitsy.tile), Object.values(bitsy.sprite), Object.values(bitsy.item)).forEach(function (drawing) {
        b3d.meshConfig[drawing.drw] = b3d.parseMeshConfigFromNameTags(drawing);
    });
};

b3d.parseMeshConfigFromNameTags = function (drawing) {
    var config = b3d.getDefaultMeshProps(drawing);
    var type = b3d.parseMeshTag(drawing);
    if (type === 'empty') {
        config.hidden = true;
    } else {
        config.type = type || config.type;
    }
    config.transparency = b3d.parseTransparentTag(drawing) === undefined && config.transparency || b3d.parseTransparentTag(drawing);
    config.transform = b3d.parseTransformTags(drawing);
    config.replacement = b3d.parseDrawTag(drawing);
    config.children = b3d.parseChildrenTag(drawing);
    return config;
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
    if (scaleTag.length > 0 || rotateTag.length > 0 || translateTag.length > 0) {
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
                        var childDrawing = map[id];
                        if (childDrawing) {
                            return b3d.parseMeshConfigFromNameTags(childDrawing);
                        }
                    }
                }
            }
        }).filter(Boolean);
    }
    return children;
}

b3d.parseTransparentTag = function (drawing) {
    var name = drawing.name || '';
    var match = name.match(/#transparent\(((true)|(false))\)/);
    if (match) {
        // 2nd capturing group reserved for 'true' will be undefined if the input said 'false'
        return Boolean(match[2]);
    }
};

b3d.parseMeshTag = function (drawing) {
    var name = drawing.name || '';
    var meshMatch = name.match(/#mesh\((.+?)\)/);
    if (meshMatch) {
        if (meshMatch[1] === 'empty') {
            return 'empty';
        } else if (b3d.meshTemplates[meshMatch[1]]) {
            return meshMatch[1];
        } else {
            // if the specified mesh template doesn't exist,
            // display error message, but continue execution
            // to resolve the mesh with default logic
            console.error(`mesh template '${meshMatch[1]}' wasn't found`);
        }
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
