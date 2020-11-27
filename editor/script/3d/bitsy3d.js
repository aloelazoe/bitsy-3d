var bitsy = window;

var b3d = {
    defaultSettings: {
        engineSize: '512x512',
        canvasSize: 'auto',

        clearColor: 0,

        enableFog: false,
        fogColor: 0,
        fogStart: 5,
        fogEnd: 20,

        // todo: dialog position
        positionDialogBoxAtTheTop: false,

        tweenDistance: 1.5,
        tweenDuration: 150,
        tweenFunction: 'linear',

        movementHoldInterval: 150,
        movementSecondStepInterval: 150,
    },

    mainCamera: null,
    curActiveCamera: null,
    curCameraPreset: null,

    engine: null,
    scene: null,

    meshTemplates: {},
    baseMat: null,

    meshConfig: {},
    roomsInStack: {},
    stackPosOfRoom: {},
    
    curStack: null,
    lastStack: null,
    lastRoom: null,

    sprites: {},
    items: {},
    tiles: {},

    caches: {},
    animatedMaterials: {},
    didUpdateAnimations: false,

    avatarRef: null,
    avatarNode: null,

    sceneCanvas: null,
    textCanvas: null,
    textContext: null,

    spriteLastPos: {},
    tweens: {},

    dialogDirty: false,
    rawDirection: bitsy.Direction.None,

    isPointerLocked: false,

    defaultCameraPreset: 'fixed target orbiter',
};

b3d.tweenFunctions = {
    'linear': function (t) {
        return t;
    },
    'quadratic': function (t) {
        t = 1 - ((1 - t) ** 2);
        return t;
    },
};

b3d.cameraPresets = {
    'orbiting follower': {
        type: 'arc',
        fov: 0.9,
        inertia: 0.7,
        target: {x: 7.5, z: 7.5, y: 3},
        alpha: -Math.PI/2,
        beta: Math.PI/3,
        radius: 6,
        lowerRadiusLimit: 6,
        upperRadiusLimit: 6,
        upperBetaLimit: Math.PI / 2,
        attachControl: true,
        followAvatar: true,
        lockPointer: true,
    },
    'fixed target orbiter': {
        type: 'arc',
        fov: 0.9,
        inertia: 0.7,
        target: {x: 7.5, z: 7.5, y: 1.5},
        alpha: -Math.PI/2,
        beta: Math.PI/3,
        radius: 20,
        lowerRadiusLimit: 20,
        upperRadiusLimit: 20,
        upperBetaLimit: Math.PI / 2,
        attachControl: true,
    },
    'fixed position rotating follower': {
        type: 'universal',
        position: {x: -1, z: 0, y: 3},
        followAvatar: true,
    },
    'free first person': {
        type: 'arc',
        fov: 1,
        inertia: 0.6,
        alpha: -Math.PI/2,
        beta: Math.PI/2,
        radius: 0.5,
        lowerRadiusLimit: 0.5,
        upperRadiusLimit: 0.5,
        upperBetaLimit: 0.75 * Math.PI,
        lowerBetaLimit: 0.1 * Math.PI,
        minZ: 0.001,
        maxZ: 100,
        attachControl: true,
        followAvatar: true,
        lockPointer: true,
    },
    'dungeon crawler': {
        type: 'arc',
        fov: 1,
        inertia: 0.6,
        alpha: -Math.PI/2,
        beta: Math.PI/2,
        radius: 0.5,
        lowerRadiusLimit: 0.5,
        upperRadiusLimit: 0.5,
        upperBetaLimit: 0.75 * Math.PI,
        lowerBetaLimit: 0.1 * Math.PI,
        minZ: 0.001,
        maxZ: 100,
        attachControl: false,
        followAvatar: true,
        lockPointer: false,
        useLeftAndRightToRotateByAngle: 0.5 * Math.PI,
    },
};

b3d.cameraDataModel = {
    commonProperties: {
        value: {
            // mode can be either 'perspective' or 'orthographic'
            mode: 'perspective',
            orthoSize: 16,
            fov: 0.9,
            minZ: 0.001,
            maxZ: 100,
        },
        trait: { followAvatar: false, lockPointer: false },
    },
    cameraTypes: {
        arc: {
            class: BABYLON.ArcRotateCamera,
            value: {
                inertia: 0.8,
                alpha: -Math.PI/2,
                beta: Math.PI/2,
                radius: 10,
                lowerRadiusLimit: 1,
                upperRadiusLimit: 30,
                wheelPrecision: 3,
                upperBetaLimit: Math.PI/2,
                lowerBetaLimit: 0,
                rotationTweenTime: 250,
                rotationTweenFunction: 'linear',
            },
            vector3: { target: {x: 7.5, z: 7.5, y: 0} },
            trait: {
                attachControl: false,
                useArrowKeysToControlCameraInsteadOfAvatar: false,
                useLeftAndRightToRotateByAngle: 0
            },
        },
        universal: {
            class: BABYLON.UniversalCamera,
            vector3: {
                position: {x: 0, z: 0, y: 0},
                rotation: {x: 0, z: 0, y: 0}
            },
        },
    },
    controllableProperties: ['target', 'alpha', 'beta', 'radius'],
    traitEffects: {
        // to be used inside camera trait setters
        // 'this' should refer to camera object
        // trait effects will be applied every time the camera is activated or deactivated
        attachControl: function (v) {
            if (v === true) {
                this.ref.attachControl(b3d.sceneCanvas);
                // update camera controls
                if (this.hasOwnProperty('useArrowKeysToControlCameraInsteadOfAvatar')) {
                    this.useArrowKeysToControlCameraInsteadOfAvatar = this.useArrowKeysToControlCameraInsteadOfAvatar;
                }
            } else if (v === false) {
                this.ref.detachControl(b3d.sceneCanvas);
            }
        },
        followAvatar: function (v) {
            if (v === true) {
                this.ref.lockedTarget = b3d.avatarNode;
            } else if (v === false) {
                this.ref.lockedTarget = null;
            }
        },
        lockPointer: function (v) {
            if (v === true) {
                b3d.sceneCanvas.addEventListener("click", b3d.lockPointer);
            } else if (v === false) {
                b3d.sceneCanvas.removeEventListener("click", b3d.lockPointer);
            }
        },
        useArrowKeysToControlCameraInsteadOfAvatar: function (v) {
            if (v === true) {
                if (this.ref.inputs.attached.keyboard) {
                    this.ref.inputs.attached.keyboard.keysLeft = [37];
                    this.ref.inputs.attached.keyboard.keysUp = [38];
                    this.ref.inputs.attached.keyboard.keysRight = [39];
                    this.ref.inputs.attached.keyboard.keysDown = [40];
                }

                ['left', 'up', 'right', 'down'].forEach(function (k) {
                    bitsy.key[k] = null;
                });
            } else if (v === false) {
                var cam = this;
                if (cam.ref.inputs.attached.keyboard) {
                    ['keysLeft', 'keysUp', 'keysRight', 'keysDown'].forEach(function (k) {
                        cam.ref.inputs.attached.keyboard[k] = [];
                    });
                }

                bitsy.key.left = 37;
                bitsy.key.up = 38;
                bitsy.key.right = 39;
                bitsy.key.down = 40;
            }
        },
        useLeftAndRightToRotateByAngle: function (v) {
            if (!this.hasOwnProperty('rotationState')) {
                Object.defineProperty(this, 'rotationState', { value: {}});
            }
            if (v === 0 || v === false) {
                // turn it off and return
                if (this.rotationState.movePlayerOriginal) {
                    // restore the original bitsy function
                    bitsy.movePlayer = this.rotationState.movePlayerOriginal;
                }
                if (this.rotationState.cameraUpdateOriginal) {
                    this.ref.update = this.rotationState.cameraUpdateOriginal;
                }
                return;
            }
            if (!this.rotationState.movePlayerOriginal || !this.rotationState.cameraUpdateOriginal) {
                this.rotationState.movePlayerOriginal = bitsy.movePlayer;
                var thisCamera = this;
                b3d.patch(bitsy, 'movePlayer', function () {
                    if (thisCamera.rotationState.isTweening) {
                        // prevent any movement by resetting bitsy direction when camera is rotating
                        bitsy.curPlayerDirection = bitsy.Direction.None;
                    } else if (bitsy.curPlayerDirection === bitsy.Direction.Left || bitsy.curPlayerDirection === bitsy.Direction.Right) {
                        // if it isn't, check if it should start rotating
                        thisCamera.rotationState.isTweening = true;
                        var dir = bitsy.curPlayerDirection === bitsy.Direction.Left ? 1 : -1;
                        thisCamera.rotationState.tweenStartingRotation = thisCamera.ref.alpha;
                        thisCamera.rotationState.tweenStartingTime = bitsy.prevTime;
                        thisCamera.rotationState.tweenRotationAmount = dir * thisCamera.useLeftAndRightToRotateByAngle;
                        bitsy.curPlayerDirection = bitsy.Direction.None;
                    }
                });
                // tween camera rotation
                b3d.patch(thisCamera.ref, 'update', null, function () {
                    var rotationState = thisCamera.rotationState;
                    var tweenFunction = b3d.tweenFunctions[thisCamera.rotationTweenFunction] || b3d.tweenFunctions['linear'];
                    var tweenPercent = Math.min(tweenFunction(((bitsy.prevTime - rotationState.tweenStartingTime) / thisCamera.rotationTweenTime)), 1);
                    if (rotationState.isTweening) {
                        var tweenPercent = Math.min(tweenFunction(((bitsy.prevTime - rotationState.tweenStartingTime) / thisCamera.rotationTweenTime)), 1);
                        thisCamera.ref.alpha = rotationState.tweenStartingRotation + (rotationState.tweenRotationAmount * tweenPercent);
                        if (tweenPercent === 1) rotationState.isTweening = false;
                    }
                });
            }
        },
    },
};

b3d.lockPointer = function () {
    b3d.sceneCanvas.requestPointerLock = b3d.sceneCanvas.requestPointerLock || b3d.sceneCanvas.msRequestPointerLock || b3d.sceneCanvas.mozRequestPointerLock || b3d.sceneCanvas.webkitRequestPointerLock;
    if (b3d.sceneCanvas.requestPointerLock) {
        b3d.sceneCanvas.requestPointerLock();
    }
};

b3d.parseSize = function (sizeStr) {
    if (!sizeStr) return;
    var match;
    var parsed;
    if (match = sizeStr.match(/^auto/)) {
        parsed = { type: 'auto' };
    } else if (match = sizeStr.match(/^(\d+)x(\d+)/)) {
        parsed = { type: 'fixed', width: match[1], height: match[2] };
    } else if (match = sizeStr.match(/^(\d+):(\d+)/)) {
        parsed = { type: 'ratio', width: match[1], height: match[2] };
    } else if (match = sizeStr.match(/^\d+/)) {
        parsed = { type: 'factor', value: match[0] };
    } else {
        console.error(`invalid size option: ${sizeStr}`);
        parsed = { type: 'invalid' };
    }
    // include serialized version
    parsed.serialized = sizeStr;
    return parsed;
};

b3d.applyEngineAndCanvasSize = function (engineSizeArg, canvasSizeArg) {
    // only apply them in exported game: editor canvas should have fixed styling and resolution
    if (bitsy.isPlayerEmbeddedInEditor) {
        b3d.engine.resize();
        return;
    }

    var engineSize = b3d.parseSize(engineSizeArg) || b3d.parseSize(b3d.settings.engineSize);
    var canvasSize = b3d.parseSize(canvasSizeArg) || b3d.parseSize(b3d.settings.canvasSize);

    // todo: implement 'factor' size for engine and 'ratio' size for canvas
    // for now only accept 'fixed' and 'auto' as valid types for both engine and canvas
    if (!engineSize || ['fixed', 'auto'].indexOf(engineSize.type) === -1) {
        console.warn(`engine size "${engineSize.serialized}" is invalid. resetting to auto`);
        engineSize = b3d.parseSize('auto');
    }
    if (!canvasSize || ['fixed', 'auto'].indexOf(canvasSize.type) === -1) {
        console.warn(`canvas size "${canvasSize.serialized}" is invalid. resetting to auto`);
        canvasSize = b3d.parseSize('auto');
    }

    // set engine and canvas size in the settings for consistency
    b3d.settings.engineSize = engineSize.serialized;
    b3d.settings.canvasSize = canvasSize.serialized;

    switch (canvasSize.type) {
        case 'fixed':
            b3d.sceneCanvas.style.width = canvasSize.width + 'px';
            b3d.sceneCanvas.style.height = canvasSize.height + 'px';
            b3d.sceneCanvas.style.maxHeight = 'initial';
            b3d.sceneCanvas.style.maxWidth = 'initial';
            break;
        case 'auto':
            if (engineSize.type === 'fixed') {
                if (parseInt(engineSize.width) >= parseInt(engineSize.height)) {
                    b3d.sceneCanvas.style.width = '100vw';
                    b3d.sceneCanvas.style.height = 'initial';
                    b3d.sceneCanvas.style.maxHeight = '100vh';
                } else {
                    b3d.sceneCanvas.style.height = '100vh';
                    b3d.sceneCanvas.style.width = 'initial';
                    b3d.sceneCanvas.style.maxWidth = '100vw';
                }
            } else {
                b3d.sceneCanvas.style.width = '100vw';
                b3d.sceneCanvas.style.height = '100vh';
            }
            break;
        case 'ratio':
            if (engineSize.type === 'fixed') {
                console.warning('canvas size can only be set as aspect ratio when engine size is not fixed');
                b3d.applyEngineAndCanvasSize(engineSizeArg, 'auto');
                return;
            } else {
                // todo: implement setting canvas dimensions as aspect ratio
            }
            break;
    }

    switch (engineSize.type) {
        case 'fixed':
            b3d.engine.setSize(parseInt(engineSize.width), parseInt(engineSize.height));
            break;
        case 'auto':
            b3d.engine.resize();
            break;
        case 'factor':
            // todo: impelement setting engine resolution as a screen resolution with the downscale factor
            break;
    }

    // make sure orthographic camera preserves aspect ratio correctly
    if (b3d.mainCamera) b3d.mainCamera.recalculateOrthoBounds();
};

document.addEventListener('DOMContentLoaded', function() {
    // patch bitsy with bitsy 3d functions
    // ensure compatibilty with hacks in exported game by using kitsy when it's included
    if (bitsy.EditMode === undefined) {
        smartPatch('startExportedGame', null, function () {
            b3d.init();
        });
        smartPatch('update', null, function () {
            b3d.update();
            b3d.render();
        });
    }

    var py;
    smartPatch('dialogRenderer.DrawTextbox',
        function () {
            py = bitsy.player().y;
            bitsy.player().y = b3d.settings.positionDialogBoxAtTheTop ? bitsy.mapsize : 0;
        }, function () {
            bitsy.player().y = py;
    });

    smartPatch('updateAnimation', null, function () {
        if (bitsy.animationCounter === 0) {
            Object.values(b3d.animatedMaterials).forEach(function (entry) {
                var drawing = entry[0];
                var mat = entry[1];
                if (drawing.animation.isAnimated) {
                    mat.diffuseTexture.uOffset = drawing.animation.frameIndex / drawing.animation.frameCount;
                    // unfreeze material to pass updated values to the shader when rendering this frame
                    mat.unfreeze();
                }
            });
            // keep track of whether we updated animations, to freeze materials after rendering this frame
            b3d.didUpdateAnimations = true;
        }
    });

    // adjust movement direction relative to the camera
    smartPatch('movePlayer',
        function () {
            var rotationTable = {};
            rotationTable[bitsy.Direction.Up] = bitsy.Direction.Left;
            rotationTable[bitsy.Direction.Left] = bitsy.Direction.Down;
            rotationTable[bitsy.Direction.Down] = bitsy.Direction.Right;
            rotationTable[bitsy.Direction.Right] = bitsy.Direction.Up;
            rotationTable[bitsy.Direction.None] = bitsy.Direction.None;

            b3d.rawDirection = bitsy.curPlayerDirection;

            var rotatedDirection = bitsy.curPlayerDirection;
            var ray = b3d.curActiveCamera.ref.getForwardRay().direction;
            var ray2 = new BABYLON.Vector2(ray.x, ray.z);
            ray2.normalize();
            var a = (Math.atan2(ray2.y, ray2.x) / Math.PI + 1) * 2 + 0.5;
            if (a < 0) {
                a += 4;
            }
            for (var i = 0; i < a; ++i) {
                rotatedDirection = rotationTable[rotatedDirection];
            }
            bitsy.curPlayerDirection = rotatedDirection;
        },
        function () {
            bitsy.curPlayerDirection = b3d.rawDirection;
    });

    smartPatch('reset_cur_game', null, b3d.reInit3dData);

    function tryAddingToKitsyQueue(key, kind, func) {
        if (window.kitsy) {
            var queue;
            if (kind === 'before') {
                queue = window.kitsy.queuedBeforeScripts;
            } else if (kind === 'after') {
                queue = window.kitsy.queuedAfterScripts;
            }
            if (queue) {
                queue[key] = queue[key] || [];
                queue[key].push(func);
                return true;
            }
        }
        return false;
    }

    function smartPatch (key, before, after) {
        var patchScope = key.split('.').length > 1 ? bitsy[key.split('.')[0]] : bitsy;
        var patchName = key.split('.').length > 1 ? key.split('.')[1] : key;
        if (before) tryAddingToKitsyQueue(key, 'before', before) ||  b3d.patch(patchScope, patchName, before, null);
        if (after) tryAddingToKitsyQueue(key, 'after', after) ||  b3d.patch(patchScope, patchName, null, after);
    }
});

// helper function to patch functions
b3d.patch = function (scope, name, before, after) {
    var original = scope[name];
    var patched = function () {
        if (before) before.apply(scope, arguments);
        var output = original.apply(scope, arguments);
        if (after) after.apply(scope, arguments);
        return output;
    }
    scope[name] = patched;
};

b3d.init = function () {    
    if (bitsy.isPlayerEmbeddedInEditor) {
        b3d.sceneCanvas = document.getElementById('sceneCanvas');
        b3d.textCanvas = document.getElementById('textCanvas');
    } else {
        // if not in the editor, do the setup specific for exported game
        // hide the original canvas and add a stylesheet
        // to make the 3D render in its place
        bitsy.canvas.parentElement.removeChild(bitsy.canvas);
        var style = `
        canvas {
            -ms-interpolation-mode: nearest-neighbor;
            image-rendering: -moz-crisp-edges;
            image-rendering: pixelated;
        }
        canvas:focus {
            outline: none;
        }
        #gameContainer {
            position: absolute;
            display: inline-grid; /*to prevent it from growing a few pixels taller than sceneCanvas*/
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
        }
        #sceneCanvas {
            position: static;
            object-fit: contain;
            width: 100vw;
            max-height: 100vh;
        }
        #textCanvas {
            position: absolute;
            object-fit: contain;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: none;
            pointer-events: none;
        }`;
        var sheet = document.createElement('style');
        sheet.textContent = style;
        document.head.appendChild(sheet);

        var gameContainer = document.createElement('div');
        gameContainer.id = 'gameContainer';
        document.body.appendChild(gameContainer);

        b3d.sceneCanvas = document.createElement('canvas');
        b3d.sceneCanvas.id = 'sceneCanvas';
        gameContainer.appendChild(b3d.sceneCanvas);

        b3d.textCanvas = document.createElement('canvas');
        b3d.textCanvas.id = 'textCanvas';
        gameContainer.appendChild(b3d.textCanvas);
        b3d.textContext = b3d.textCanvas.getContext('2d');
    }

    b3d.engine = new BABYLON.Engine(b3d.sceneCanvas, false);
    b3d.scene = new BABYLON.Scene(b3d.engine);
    b3d.scene.ambientColor = new BABYLON.Color3(1, 1, 1);
    b3d.scene.freezeActiveMeshes();

    // optimization: this gives noticeable boost in very large scenes
    b3d.scene.blockMaterialDirtyMechanism = true;

    // set up text canvas
    b3d.textCanvas.width = bitsy.canvas.width;
    b3d.textCanvas.height = bitsy.canvas.height;
    b3d.textContext = b3d.textCanvas.getContext('2d');
    bitsy.dialogRenderer.AttachContext(b3d.textContext);

    // create basic resources
    b3d.meshTemplates = b3d.initMeshTemplates();

    // material
    b3d.baseMat = new BABYLON.StandardMaterial('base material', b3d.scene);
    b3d.baseMat.ambientColor = new BABYLON.Color3(1, 1, 1);
    b3d.baseMat.maxSimultaneousLights = 0;
    b3d.baseMat.freeze();

    // create transform node that will copy avatar's position
    // prevents crashes when used as a camera target when avatar mesh is a billboard
    b3d.avatarNode = new BABYLON.TransformNode('avatarNode');

    // initialize the following objects by parsing serialized data:
    // * b3d.meshConfig
    // * b3d.roomsInStack
    // * b3d.stackPosOfRoom
    // * b3d.camera
    // * b3d.settings
    b3d.parseData();

    // watch for browser/canvas resize events
    window.addEventListener("resize", function () {
        if (b3d.settings.engineSize === 'auto' || b3d.settings.canvasSize === 'auto') {
            b3d.applyEngineAndCanvasSize();
        }
    });

    // watch for locking/unlocking the pointer
    document.addEventListener('pointerlockchange', function () {
        if (document.pointerLockElement || document.mozPointerLockElement) {
            b3d.isPointerLocked = true;
        } else {
            b3d.isPointerLocked = false;
        }
    });
};

// return true if data was parsed successfully and false if it was initiazlied with default values
b3d.parseDataFromDialog = function () {
    var serialized = bitsy.dialog['DATA3D'] && bitsy.dialog['DATA3D'].src;
    var parsed;
    if (serialized) {
        // remove bitsy multiline dialog tokens if there are any
        serialized = serialized.replace('"""\n', '');
        serialized = serialized.replace('\n"""', '');
        var parsed = JSON.parse(serialized);
    }

    // parse mesh config
    // b3d.meshConfig should contain configuration for every drawing
    [].concat(Object.values(bitsy.tile), Object.values(bitsy.sprite), Object.values(bitsy.item)).forEach(function (drawing) {
        var parsedConfig = parsed && parsed.mesh[drawing.drw] || {};
        b3d.meshConfig[drawing.drw] = b3d.parseMesh(drawing, parsedConfig);
    });

    // parse stacks
    if (parsed && parsed.stack) {
        Object.entries(parsed.stack).forEach(function (entry) {
            var stackId = entry[0];
            var roomList = entry[1];
            roomList.forEach(function (room) {
                b3d.registerRoomInStack(room.id, stackId, room.pos);
            });
        });
    }

    b3d.settings = JSON.parse(JSON.stringify(b3d.defaultSettings));
    if (parsed && parsed.settings) {
        Object.keys(b3d.defaultSettings).forEach(function (key) {
            if (parsed.settings[key] !== null && parsed.settings[key] !== undefined) {
                b3d.settings[key] = parsed.settings[key];
            }
        });
    }
    b3d.applySettings();

    // load camera from serialized data or create a default camera
    // camera can be either a string specifying a preset or an object with custom camera configuration
    if (parsed && parsed.camera) {
        if (typeof parsed.camera === 'string') {
            b3d.curCameraPreset = b3d.cameraPresets[parsed.camera] ? parsed.camera : b3d.defaultCameraPreset;
            b3d.mainCamera = b3d.createCamera(b3d.cameraPresets[b3d.curCameraPreset]);
        } else if (typeof parsed.camera === 'object') {
            b3d.curCameraPreset = null;
            b3d.mainCamera = b3d.createCamera(parsed.camera);
        }
    } else {
        b3d.curCameraPreset = b3d.defaultCameraPreset;
        b3d.mainCamera = b3d.createCamera(b3d.cameraPresets[b3d.defaultCameraPreset]);
    }
    b3d.mainCamera.activate();

    return Boolean(serialized);
}; // b3d.parseDataFromDialog ()

b3d.parseData = b3d.parseDataFromDialog;

b3d.reInit3dData = function () {
    // clear all caches to force all drawings to reset during the update
    b3d.clearCaches(Object.values(b3d.caches));
    
    // since there is no way to tell what exactly was changed, reset everything
    // reset stack objects
    b3d.roomsInStack = {};
    b3d.stackPosOfRoom = {};
    b3d.meshConfig = {};

    // delete camera
    b3d.mainCamera.deactivate();
    b3d.mainCamera.ref.dispose();
    b3d.mainCamera = null;

    // reload data
    b3d.parseData();
};

// all objects will have drawing, type, transparency, hidden and alpha set by b3d.getDefaultMeshProps,
// and other properties are optional
b3d.parseMesh = function (drawing, parsedConfig) {
    var config = b3d.getDefaultMeshProps(drawing);
    config.type = parsedConfig.type || config.type;
    config.transparency = parsedConfig.hasOwnProperty('transparency') ? parsedConfig.transparency : config.transparency;
    config.transform = parsedConfig.transform && b3d.transformFromArray(parsedConfig.transform.split(','));
    config.replacement = parsedConfig.replacement && b3d.getDrawingFromDrw(parsedConfig.replacement);
    config.hidden = parsedConfig.hasOwnProperty('hidden') ? parsedConfig.hidden : config.hidden;
    config.alpha = parsedConfig.hasOwnProperty('alpha') ? parsedConfig.alpha : config.alpha;
    if (parsedConfig.children && parsedConfig.children.length > 0) {
        config.children = [];
        parsedConfig.children.forEach(function (c) {
            var childDrw;
            var childConfig;
            if (typeof c === 'object' && c.drw) {
                childDrw = c.drw;
                childConfig = b3d.parseMesh(b3d.getDrawingFromDrw(childDrw), c);
            } else if (typeof c === 'string') {
                childDrw = c;
                childConfig = b3d.parseMesh(b3d.getDrawingFromDrw(childDrw), {});
            }
            if (childConfig) {
                config.children.push(childConfig);
            }
        });
    }
    return config;
};

b3d.applySettings = function () {
    bitsy.playerHoldToMoveInterval = b3d.settings.movementHoldInterval;
    bitsy.playerSecondStepInterval = b3d.settings.movementSecondStepInterval;

    b3d.applyEngineAndCanvasSize();

    // apply fog settings
    b3d.scene.fogStart = b3d.settings.fogStart;
    b3d.scene.fogEnd = b3d.settings.fogEnd;
    b3d.scene.fogMode = b3d.settings.enableFog ? BABYLON.Scene.FOGMODE_LINEAR : BABYLON.Scene.FOGMODE_NONE;
};

// create a camera from serialized data
b3d.createCamera = function (camData) {
    if (!camData) {
        return;
    } else if (!camData.type) {
        console.error("couldn't create camera: camera type wasn't specified");
        return;
    } else if (!b3d.cameraDataModel.cameraTypes[camData.type]) {
        console.error(`couldn't create camera: camera type '${camData.type}' isn't supported"`);
        return;
    }

    var camera = {};

    // define read-only camera type
    Object.defineProperty(camera, 'type', {
        configurable: false,
        enumerable: true,
        writable: false,
        value: camData.type,
    });

    // camera.ref will hold a reference to babylonjs camera
    Object.defineProperty(camera, 'ref', {
        configurable: false,
        enumerable: false,
        writable: false,
        value: new b3d.cameraDataModel.cameraTypes[camData.type].class(),
    });

    // set up value properties
    [].concat(
        Object.entries(b3d.cameraDataModel.commonProperties.value || {}),
        Object.entries(b3d.cameraDataModel.cameraTypes[camData.type].value || {}),
    )
    .forEach(function (entry) {
        var k = entry[0];
        var v = entry[1];
        // if property is controllable by direct user input, we should keep a separate version of it
        var isControllable = b3d.cameraDataModel.controllableProperties.indexOf(k) !== -1;
        if (isControllable) {
            var internalValue;
            Object.defineProperty(camera, k, {
                configurable: true,
                enumerable: true,
                get: function () { return internalValue; },
                set: function (a) {
                    internalValue = a;
                    this.ref[k] = a;
                },
            });
        // define special properties that need custom setters
        } else if (k === 'mode') {
            var internalValue;
            Object.defineProperty(camera, 'mode', {
                configurable: true,
                enumerable: true,
                get: function () { return internalValue; },
                set: function (a) {
                    internalValue = a;
                    if (a === 'perspective') {
                        this.ref.mode = BABYLON.Camera.PERSPECTIVE_CAMERA;
                    } else if (a === 'orthographic') {
                        this.ref.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
                    }
                },
            });
        } else if (k === 'orthoSize') {
            Object.defineProperty(camera, 'recalculateOrthoBounds', {
                // adjust orthographic boundaries according to the orthoSize and aspect ratio
                configurable: false,
                enumerable: false,
                writable: false,
                value: function () {
                    // figure out aspect ratio
                    var widthFactor = 1;
                    var heightFactor = 1;
                    var ratio = this.ref.getEngine().getRenderWidth() / this.ref.getEngine().getRenderHeight();
                    if (ratio >= 1) {
                        widthFactor = ratio;
                    } else {
                        heightFactor = 1 / ratio;
                    }
                    // divide orthoSize by two for each dimension
                    this.ref.orthoLeft = -(this.orthoSize * widthFactor) / 2;
                    this.ref.orthoRight = (this.orthoSize * widthFactor) / 2;
                    this.ref.orthoTop = (this.orthoSize * heightFactor) / 2;
                    this.ref.orthoBottom = -(this.orthoSize * heightFactor) / 2;
                },
            });
            var internalValue;
            Object.defineProperty(camera, 'orthoSize', {
                configurable: true,
                enumerable: true,
                get: function () { return internalValue; },
                set: function (a) {
                    internalValue = a;
                    this.recalculateOrthoBounds();
                },
            });
        // define regular properties
        } else {
            Object.defineProperty(camera, k, {
                configurable: true,
                enumerable: true,
                get: function () { return this.ref[k]; },
                set: function (a) { this.ref[k] = a; },
            });
        }

        // set properties
        if (camData[k] !== undefined) {
            camera[k] = camData[k];
        } else {
            camera[k] = v;
        }
    });

    // set up vector properties
    [].concat(
        Object.entries(b3d.cameraDataModel.commonProperties.vector3 || {}),
        Object.entries(b3d.cameraDataModel.cameraTypes[camData.type].vector3 || {}),
    )
    .forEach(function (entry) {
        var k = entry[0];
        var v = entry[1];
        var isControllable = b3d.cameraDataModel.controllableProperties.indexOf(k) !== -1;
        var internalVectorObject = {};
        camera.ref[k] = new BABYLON.Vector3();
        Object.keys(camera.ref[k]).forEach(function (vectorKey) {
            if (isControllable) {
                var val;
                Object.defineProperty(internalVectorObject, vectorKey, {
                    configurable: true,
                    enumerable: true,
                    get: function () { return val; },
                    set: function (a) { val = camera.ref[k][vectorKey] = a; },
                });
            } else {
                Object.defineProperty(internalVectorObject, vectorKey, {
                    configurable: true,
                    enumerable: true,
                    get: function () { return camera.ref[k][vectorKey]; },
                    set: function (a) { camera.ref[k][vectorKey] = a; },
                });
            }
        });
        camera[k] = internalVectorObject;
        if (camData[k]) {
            b3d.deepCopyObjectState(camera[k], camData[k]);
        } else {
            b3d.deepCopyObjectState(camera[k], v);
        }
    });

    // set up traits
    // local variable to store internal trait values for this camera
    var traits = {};

    [].concat(
        Object.entries(b3d.cameraDataModel.commonProperties.trait || {}),
        Object.entries(b3d.cameraDataModel.cameraTypes[camData.type].trait || {}),
    )
    .forEach(function (entry) {
        var k = entry[0];
        var v = entry[1];
        traits[k] = null;
        Object.defineProperty(camera, k, {
            configurable: true,
            enumerable: true,
            get: function () { return traits[k]; },
            set: function (a) {
                traits[k] = a;
                // if camera is currently active, invoke trait effect immediately
                if (b3d.curActiveCamera === this) {
                    b3d.cameraDataModel.traitEffects[k].call(this, a);
                }
            },
        });
        if (camData[k] !== undefined) {
            camera[k] = camData[k];
        } else {
            camera[k] = v;
        }
    });

    // define methods
    Object.defineProperty(camera, 'activate', {
        configurable: false,
        enumerable: false,
        writable: false,
        value: function () {
            if (b3d.curActiveCamera) {
                b3d.curActiveCamera.deactivate();
            }

            b3d.curActiveCamera = this;
            b3d.scene.activeCameras = [];
            b3d.scene.activeCamera = this.ref;

            // enable trait effects
            Object.keys(traits).forEach(function (t) {
                if (traits[t]) {
                    b3d.cameraDataModel.traitEffects[t].call(this, true);
                }
            }, this);
        },
    });

    Object.defineProperty(camera, 'deactivate', {
        configurable: false,
        enumerable: false,
        writable: false,
        value: function () {
            // disable trait effects
            Object.keys(traits).forEach(function (t) {
                if (traits[t]) {
                        b3d.cameraDataModel.traitEffects[t].call(this, false);
                    }
                }, this);
        },
    });

    Object.defineProperty(camera, 'resetRef', {
        configurable: false,
        enumerable: false,
        writable: false,
        value: function () {
            b3d.deepCopyObjectState(this.ref, this, b3d.cameraDataModel.controllableProperties);
        },
    });

    return camera;
};

b3d.getDefaultMeshProps = function (drawing) {
    return {
        drawing: drawing,
        type: b3d.getDefaultMeshType(drawing),
        transparency: b3d.getDefaultTransparency(drawing),
        hidden: false,
        alpha: 1,
    };
};

b3d.transformFromArray = function (arr) {
    return BABYLON.Matrix.Compose(
        // scale
        new BABYLON.Vector3(
            Number(arr[0]) || 1,
            Number(arr[1]) || 1,
            Number(arr[2]) || 1
        ),
        // rotation
        BABYLON.Quaternion.FromEulerAngles(
            (Number(arr[3]) || 0) * Math.PI / 180,
            (Number(arr[4]) || 0) * Math.PI / 180,
            (Number(arr[5]) || 0) * Math.PI / 180
        ),
        // translation
        new BABYLON.Vector3(
            Number(arr[6]) || 0,
            Number(arr[7]) || 0,
            Number(arr[8]) || 0
        ),
    );
};

// helper function
// finds drawing object by its full id i.g. 'SPR_A'
b3d.getDrawingFromDrw = function (drw) {
    var map;
    var typeAndId = drw.split('_');
    switch (typeAndId[0]) {
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
    return map[ typeAndId[1] ];
};

b3d.registerRoomInStack = function (roomId, stackId, pos) {
    b3d.roomsInStack[stackId] = b3d.roomsInStack[stackId] || [];
    // add room to the list if it is not already there
    if (b3d.roomsInStack[stackId].indexOf(roomId) === -1) {
        b3d.roomsInStack[stackId].push(roomId);
    }
    // add or update position of the room in the stack
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

b3d.serializeDataAsDialog = function () {
    // serialize stack data
    var stackSerialized = {};
    Object.entries(b3d.roomsInStack).forEach(function (entry) {
        var stackId = entry[0];
        var roomList = entry[1];
        stackSerialized[stackId] = stackSerialized[stackId] || [];
        roomList.forEach(function (roomId) {
            stackSerialized[stackId].push({
                id: roomId,
                pos: b3d.stackPosOfRoom[roomId].pos,
            });
        });
    });

    // serialize mesh data
    var meshSerialized = {};

    Object.entries(b3d.meshConfig).forEach(function (entry) {
        var id = entry[0]
        var config = entry[1];

        var configSerialized = b3d.serializeMesh(config);

        if (Object.values(configSerialized).length > 0) {
            meshSerialized[id] = configSerialized;
        }
    });

    var result = JSON.stringify({
        camera: b3d.curCameraPreset || b3d.mainCamera,
        settings: b3d.settings,
        mesh: meshSerialized,
        stack: stackSerialized
    }, null, 2);
    // console.log(result);
    bitsy.dialog['DATA3D'] = {
        src:'"""\n' + result + '\n"""',
        name: null,
    };
}; // b3d.serializeDataAsDialog

b3d.serializeData = b3d.serializeDataAsDialog;

b3d.serializeMesh = function (meshConfig) {
    var drawing = meshConfig.drawing;

    var configSerialized = {};

    if (meshConfig.type !== b3d.getDefaultMeshType(drawing)) {
        configSerialized.type = meshConfig.type;
    }
    if (meshConfig.transform && !meshConfig.transform.isIdentity()) {
        configSerialized.transform = b3d.serializeTransform(meshConfig.transform).join(',');
    }
    if (meshConfig.transparency !== b3d.getDefaultTransparency(drawing)) {
        configSerialized.transparency = meshConfig.transparency;
    }
    if (meshConfig.replacement) {
        configSerialized.replacement = meshConfig.replacement.drw;
    }
    if (meshConfig.hidden) {
        configSerialized.hidden = meshConfig.hidden;
    }
    if (meshConfig.hasOwnProperty('alpha') && meshConfig.alpha !== 1) {
        configSerialized.alpha = meshConfig.alpha;
    }
    if (meshConfig.children && meshConfig.children.length > 0) {
        configSerialized.children = [];
        meshConfig.children.forEach(function (childConfig) {
            var childConfigSerialized = b3d.serializeMesh(childConfig);
            childConfigSerialized.drw = childConfig.drawing.drw;
            configSerialized.children.push(childConfigSerialized);
        });
    }

    return configSerialized;
};

b3d.serializeTransform = function (transform) {
    // serialize transform matrix as an array:
    // [ scaleX, scaleY, scaleZ,
    //   rotationX, rotationY, rotationZ,
    //   translationX, translationY, translationZ ]
    var scale = new BABYLON.Vector3();
    var rotation = new BABYLON.Quaternion();
    var translation = new BABYLON.Vector3();

    transform.decompose(scale, rotation, translation);

    return [].concat(
        scale.asArray(),
        rotation.toEulerAngles().asArray().map(function(n){return n * 180 / Math.PI}),
        translation.asArray())
        .map(function (n) {
            // adjust weird offsets that are apparently caused by float imprecision
            // it should be consistent with the editor input validation
            // that only allows 5 digits after the decimal point
            return Math.round(n * 100000) / 100000;
        });
};

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

    // add empty mesh
    meshTemplates.empty = new BABYLON.Mesh('empty', b3d.scene);

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

b3d.getTextureFromCache = b3d.getCache('tex', function(drawing, pal, transparency, alpha) {
    var numFrames = drawing.animation.isAnimated? drawing.animation.frameCount: 1;
    var imageSource = bitsy.renderer.GetImageSource(drawing.drw);
    var frameWidth = imageSource[0][0].length;
    var frameHeight = imageSource[0].length;

    // get the colors
    var bg = bitsy.palette[pal].colors[0].slice();
    bg[3] = transparency? 0: Math.round(alpha * 255);
    var fg = bitsy.palette[pal].colors[drawing.col].slice();
    fg[3] = Math.round(alpha * 255);

    var tex = new BABYLON.DynamicTexture(drawing.drw, {
        width: frameWidth * numFrames,
        height: frameHeight,
    }, b3d.scene, false, BABYLON.Texture.NEAREST_NEAREST_MIPNEAREST);

    tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    tex.uScale = 1 / numFrames;
    if (transparency || alpha < 1) tex.hasAlpha = true;

    var ctx = tex.getContext();
    var imageData = ctx.getImageData(0, 0, frameWidth * numFrames, frameHeight);
    for (var frameIndex = 0; frameIndex < numFrames; frameIndex++) {
        var curFrame = imageSource[frameIndex];
        for (var y = 0; y < curFrame.length; y++) {
            for (var x = 0; x < curFrame[y].length; x++) {
                // position of the red component of the pixel at a given coordinate
                var i = y * (frameWidth * numFrames * 4) + ((frameWidth * frameIndex) + x) * 4;
                // choose background or foreground color               
                var col = curFrame[y][x] === 0? bg: fg;
                // iterate through red, green, blue and alpha components
                // and put them into image data
                for (var c = 0; c < col.length; c++) {
                    imageData.data[i + c] = col[c];
                }
            }
        }
    }

    ctx.putImageData(imageData, 0, 0);
    tex.update();
    return tex;
});

b3d.getTexture = function (drawing, pal, transparency, alpha) {
    // apply drawing replacement
    var altDrawing = b3d.meshConfig[drawing.drw].replacement;
    drawing = altDrawing && altDrawing || drawing;

    var drw = drawing.drw;
    var col = drawing.col;
    var key = `${drw},${col},${pal},${transparency},${alpha}`;
    return b3d.getTextureFromCache(key, [drawing, pal, transparency, alpha]);
};

b3d.getMaterialFromCache = b3d.getCache('mat', function (drawing, pal, transparency, alpha, key) {
    var mat = b3d.baseMat.clone();
    mat.diffuseTexture = b3d.getTexture(drawing, pal, transparency, alpha);
    if (drawing.animation.isAnimated) {
        // make sure it's listed in the collection of animated materials, update the reference if needed
        if (b3d.animatedMaterials[key]) {
            b3d.animatedMaterials[key][0] = drawing;
            b3d.animatedMaterials[key][1] = mat;
        } else {
            b3d.animatedMaterials[key] = [drawing, mat];
        }
    }
    if (alpha < 1) {
        mat.useAlphaFromDiffuseTexture = true;
    }
    return mat;
});

b3d.getMaterial = function (drawing, pal, transparency, alpha) {
    var drw = drawing.drw;
    var col = drawing.col;
    var key = `${drw},${col},${pal},${transparency},${alpha}`;
    return b3d.getMaterialFromCache(key, [drawing, pal, transparency, alpha, key]);
};

b3d.getMeshFromCache = b3d.getCache('mesh', function (drawing, pal, config, hidden) {
    var mesh;
    if (hidden) {
        mesh = b3d.meshTemplates.empty.clone();
    } else {
        mesh = b3d.meshTemplates[config.type].clone();
    }
    mesh.makeGeometryUnique();
    mesh.isVisible = false;
    mesh.material = b3d.getMaterial(drawing, pal, config.transparency, config.alpha);
    // enable vertical tiling for towers
    if (config.type.startsWith('tower')) {
        mesh.material.diffuseTexture.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    }
    return mesh;
});

b3d.getMesh = function (drawing, pal, config) {
    var hidden = b3d.isObjectHidden(config);
    // if this object doesn't have children and should be hidden and isn't a sprite, it will be null and won't be added at all
    if (hidden && !config.children && drawing.room === undefined) {
        return null;
    }
    var drw = drawing.drw;
    var col = drawing.col;
    // include type in the key to account for cases when drawings that link to
    // the same 'drw' need to have different types when using with other hacks
    var key = `${drw},${col},${pal},${config.type},${config.transparency},${config.alpha},${hidden}`;
    return b3d.getMeshFromCache(key, [drawing, pal, config, hidden]);
};

b3d.clearCaches = function (cachesArr, drw, col, pal) {
    var r = new RegExp(`${drw || '\\D\\D\\D_\\w+?'},${col || '\\d*?'},${pal || '\\d*'}`);
    cachesArr.forEach(function(cache) {
        Object.keys(cache)
            .filter(function(key) {return r.test(key);})
            .forEach(function(key) {
                cache[key].dispose();
                delete cache[key];
            });
    });
}

b3d.clearCachesPalette = function (pal) {
    b3d.clearCaches(Object.values(b3d.caches), null, null, pal);
};

b3d.clearCachesTexture = function (drw) {
    b3d.clearCaches(Object.values(b3d.caches), drw, null, null);
};

b3d.clearCachesMesh = function (drw) {
    b3d.clearCaches([b3d.caches.mesh], drw, null, null);
};

b3d.update = function () {
    // console.log("update called");
    b3d.curStack = b3d.stackPosOfRoom[bitsy.curRoom] && b3d.stackPosOfRoom[bitsy.curRoom].stack || null;
    var didChangeScene = b3d.curStack? b3d.curStack !== b3d.lastStack: bitsy.curRoom !== b3d.lastRoom;
    var editorMode = bitsy.isPlayerEmbeddedInEditor && !bitsy.isPlayMode;

    // sprite changes
    Object.entries(b3d.sprites).forEach(function (entry) {
        var id = entry[0];
        var mesh = entry[1];
        var s = bitsy.sprite[id];
        if (s && b3d.isRoomVisible(s.room)) {
        // if the sprite still exists, is in the current room or in the current stack
        // update sprite's position
            mesh.bitsyOrigin.x = s.x;
            mesh.bitsyOrigin.y = s.y;
            mesh.bitsyOrigin.roomId = s.room;

            var targetX = s.x;
            var targetZ = bitsy.mapsize - 1 - s.y;
            var targetY = b3d.curStack && b3d.stackPosOfRoom[s.room].pos || 0;

            b3d.spriteLastPos[id] = b3d.spriteLastPos[id] || new BABYLON.Vector3(targetX, targetY, targetZ);
            var lastPos = b3d.spriteLastPos[id];

            if (!editorMode &&
                !lastPos.equalsToFloats(targetX, targetY, targetZ) && 
                lastPos.subtractFromFloats(targetX, targetY, targetZ).length() <= b3d.settings.tweenDistance) {
                // add a tween from current position
                b3d.tweens[id] = {
                    from: mesh.position.clone(),
                    to: new BABYLON.Vector3(targetX, targetY, targetZ),
                    start: bitsy.prevTime,
                };
            } else {
                // otherwise move the sprite immediately
                mesh.position.x = targetX;
                mesh.position.z = targetZ;
                mesh.position.y = targetY;
            }
            // remember current position
            lastPos.copyFromFloats(targetX, targetY, targetZ);
        } else {
        // otherwise remove the sprite
            mesh.dispose();
            mesh = null;
            delete b3d.sprites[id];
            delete b3d.tweens[id];
            delete b3d.spriteLastPos[id];
        }
    });
    Object.values(bitsy.sprite).filter(function (s) {
        // go through bitsy sprites and get those that should be currently displayed
        return b3d.isRoomVisible(s.room);
    }).forEach(function (s) {
        b3d.sprites[s.id] = b3d.updateObject(b3d.sprites[s.id], s, s.room, s.x, s.y);
    });
    // remove existing tweens when changing the scene
    if (didChangeScene || editorMode) {
        Object.keys(b3d.tweens).forEach(function(k){
            delete b3d.tweens[k];
        });
    }
    // apply tweens
    if (!editorMode) {
        Object.entries(b3d.tweens).forEach(function (entry) {
            var id = entry[0];
            var tween = entry[1];
            var t = (bitsy.prevTime - tween.start) / b3d.settings.tweenDuration;
            if (t < 1) {
                BABYLON.Vector3.LerpToRef(
                    tween.from,
                    tween.to,
                    b3d.tweenFunctions[b3d.settings.tweenFunction](t),
                    b3d.sprites[id].position
                );
            } else {
                delete b3d.tweens[id];
            }
        });
    }
    // copy avatar's position into avatarNode
    if (b3d.avatarRef && b3d.avatarRef.position) {
        b3d.avatarNode.position = b3d.avatarRef.position;
    }

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
        if (entry[1]) {
            entry[1].dispose();
        }
        entry[1] = null;
        delete b3d.items[entry[0]];
    });

    // make/update relevant b3d.items
    (b3d.roomsInStack[b3d.curStack] || [bitsy.curRoom]).forEach(function (roomId) {
        bitsy.room[roomId].items.forEach(function (roomItem) {
            var key = `${roomId},${roomItem.id},${roomItem.x},${roomItem.y}`;
            b3d.items[key] = b3d.updateObject(b3d.items[key], bitsy.item[roomItem.id], roomId, roomItem.x, roomItem.y);
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
                b3d.tiles[roomId][y][x] = b3d.updateObject(b3d.tiles[roomId][y][x], bitsy.tile[tileId], roomId, x, y);
            });
        });
    });

    // bg changes
    b3d.scene.clearColor = b3d.getColor(b3d.settings.clearColor);
    b3d.scene.fogColor = b3d.getColor(b3d.settings.fogColor);

    b3d.lastStack = b3d.curStack;
    b3d.lastRoom = bitsy.curRoom;

    // clear out the text context when not in use
    if (!bitsy.dialogBuffer.IsActive() || (bitsy.isPlayerEmbeddedInEditor && !bitsy.isPlayMode)) {
        if (b3d.dialogDirty) {
            b3d.textContext.clearRect(0, 0, b3d.textCanvas.width, b3d.textCanvas.height);
            b3d.dialogDirty = false;
        }
    } else {
        b3d.dialogDirty = true;
    }
}; // b3d.update()

b3d.render = function () {
    // clear scene when rendering title/endings
    // using a FOV hack here instead of the engine's clear function
    // in order to ensure post-processing isn't overridden
    var fov = b3d.curActiveCamera.ref.fov;
    if ((!isPlayerEmbeddedInEditor || isPlayMode) && (bitsy.isNarrating || bitsy.isEnding)) {
        b3d.curActiveCamera.ref.fov = 0;
    }
    b3d.scene.render();

    // if we updated animations this frame, make sure to freeze animated materials again
    if (b3d.didUpdateAnimations) {
        Object.values(b3d.animatedMaterials).forEach(function (entry) {
            entry[1].freeze();
        });
        b3d.didUpdateAnimations = false;
    };
    b3d.curActiveCamera.ref.fov = fov;
};

b3d.updateObject = function (oldObject, drawing, roomId, x, y) {
    // consider that drawing can be undefined and oldObject could be undefined
    var newObject = null;
    if (drawing) {
        // if this object doesn't have children and should be hidden, it will be null and won't be added at all
        newObject = b3d.getMesh(drawing, bitsy.curPal(), b3d.meshConfig[drawing.drw]);
    }
    if (oldObject !== newObject && (newObject !== (oldObject && oldObject.sourceMesh))) {
        if (oldObject) {
            oldObject.dispose();
            oldObject = null;
        }
        if (newObject) {
            newObject = b3d.addMeshInstance(newObject, drawing, roomId, x, y);
            return newObject;
        } else {
            return oldObject;
        }
    } else if (drawing && oldObject) {
        b3d.updateChildren(drawing, oldObject);
        return oldObject;
    } else {
        return null;
    }
};

b3d.isObjectHidden = function (config) {
    return config.hidden && (bitsy.EditMode === undefined || b3d.curActiveCamera === b3d.mainCamera);
};

b3d.isRoomVisible = function (roomId) {
    // true if the room is the current room or we are in the stack and the room is not a stray room and is in the current stack
    return roomId === bitsy.curRoom || b3d.curStack && b3d.stackPosOfRoom[roomId] && b3d.stackPosOfRoom[roomId].stack === b3d.curStack;
};

b3d.addMeshInstance = function (mesh, drawing, roomId, x, y) {
    var instance = mesh.createInstance();
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

    b3d.meshExtraSetup(drawing, instance, b3d.meshConfig[drawing.drw]);

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

b3d.addChildren = function (drawing, mesh) {
    // make sure the mesh we are about to add children to doesn't have a parent on its own to avoid ifinite loops
    if (!mesh.parent && b3d.meshConfig[drawing.drw].children) {
        // add specified drawings to the b3d.scene as child meshes
        b3d.meshConfig[drawing.drw].children.forEach(function(childConfig) {
            var childDrawing = childConfig.drawing;
            var childMesh = b3d.getMesh(childDrawing, bitsy.curPal(), childConfig);
            if (childMesh){
                childMesh = childMesh.createInstance();
            }  else {
                return;
            }
            childMesh.position.x = mesh.position.x;
            childMesh.position.y = mesh.position.y;
            childMesh.position.z = mesh.position.z;
            childMesh.setParent(mesh);
            b3d.meshExtraSetup(childDrawing, childMesh, childConfig);
            // for editor version of the 3d hack allow all child meshes to move with their parent
            childMesh.unfreezeWorldMatrix();
        });
    }
};

b3d.updateChildren = function (parentDrawing, parentMesh) {
    var childrenConfigs = b3d.meshConfig[parentDrawing.drw].children;
    if (!childrenConfigs || !parentMesh) return;
    var childMeshes = parentMesh.getChildren();
    childrenConfigs.forEach(function (config, i) {
        var oldMesh = childMeshes[i];
        var newMesh = null;
        newMesh = b3d.getMesh(config.drawing, bitsy.curPal(), config);
        if (oldMesh !== newMesh && (newMesh !== (oldMesh && oldMesh.sourceMesh))) {
            if (oldMesh) {
                oldMesh.dispose();
            }
            if (newMesh) {
                newMesh = newMesh.createInstance();
                newMesh.position.x = parentMesh.position.x;
                newMesh.position.y = parentMesh.position.y;
                newMesh.position.z = parentMesh.position.z;
                newMesh.setParent(parentMesh);
                b3d.meshExtraSetup(config.drawing, newMesh, config);
                newMesh.unfreezeWorldMatrix();
            }
        }
    });
};

b3d.getDefaultTransparency = function (drawing) {
    return !drawing.drw.includes('TIL');
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

b3d.meshExtraSetup = function (drawing, mesh, meshConfig) {
    b3d.addChildren(drawing, mesh);
    if (meshConfig.transform) {
        mesh.setPreTransformMatrix(meshConfig.transform);
        if (drawing === bitsy.player()) {
            b3d.avatarNode.setPreTransformMatrix(meshConfig.transform);
        }
    }
    if (mesh.sourceMesh && mesh.sourceMesh.source.name === 'billboard') {
        mesh.billboardMode = b3d.getBillboardMode();
    } else if (!drawing.drw.startsWith('SPR')) {
        mesh.freezeWorldMatrix();
    }
    if (drawing === bitsy.player()) {
        b3d.avatarRef = mesh;
    }
};

b3d.deepCopyObjectState = function (target, source, filter) {
    var propertyList = filter || Object.keys(source);
    propertyList.forEach(function (p) {
        if (!(p in target) || !(p in source)) {
            return;
        } else if (typeof target[p] === 'object' && typeof source[p] === 'object') {
            b3d.deepCopyObjectState(target[p], source[p]);
        } else {
            target[p] = source[p];
        }
    });
};

b3d.cameraStateSnapshot = {
    propertyList: ['alpha', 'beta', 'radius', 'fov', 'target', 'inertia'],
    take: function () {
        var obj = {};
        this.propertyList.forEach(function (p) {
            obj[p] = b3d.scene.activeCamera[p];
        });
        return JSON.stringify(obj);
    },
    apply: function (snapshot) {
        var obj = JSON.parse(snapshot);
        b3d.deepCopyObjectState(b3d.scene.activeCamera, obj);
    },
};
