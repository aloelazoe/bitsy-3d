this.hacks = this.hacks || {};
(function (exports, bitsy, kitsy) {
'use strict';

/**
📦
@file 3d
@summary bitsy in three dee
@license MIT
@version 2.0
@requires 6.4
@author Sean S. LeBlanc & Elkie Nova

@description
this is an alternative version of 3d hack to be used with bitsy 3d editor
*/

var hackOptions = {
    // determines the resolution of the scene rendered
    // if auto is true, the width/height will be ignored,
    // and the scene will instead render at 1:1 with the canvas
    // use it if you want it to look crisp on any screen
    // otherwise, i recommend something in the range of 64-512
    size: {
        auto: true,
        width: 128,
        height: 128,
    },

    // set clear color and fog color
    // default is 0: background color in the current bitsy pallete
    clearColor: 0,
    fogColor: 0,

    // if true, inputs are rotated to match the current camera direction
    // if you're using a camera that can be freely rotated,
    // this will generally be preferable,
    // but you may want to disable it for some setups
    // (e.g. a fixed third person camera)
    cameraRelativeMovement: true,

    // if true, left/right inputs are overridden to control 90-degree camera rotations
    // this requires `camerarelativemovement: true` to be usable,
    // and it's recommended to not add camera controls if used
    tankControls: true,

    // if true, dialog renders at the top
    // otherwise, renders at the bottom
    // (bitsy's typical position-based rendering doesn't make sense in 3d)
    topDialog: false,

    // smooth moves hack options
    // duration of ease in ms
    duration: 200,

    // max distance to allow tweens
    delta: 1.5,

    // easing function
    ease: function (t) {
        t = 1 - ((1 - t) ** 2);
        return t;
    },

    // scene setup
    // a number of helper functions are provided to make this easier
    // but the only necessary thing is to create a camera and assign it to the scene
    init: function (scene) {
        scene.activeCamera = makeBaseCamera(scene); // creates a camera with some basic presets
        // makeOrthographic(scene.activeCamera, bitsy.mapsize); // makes the camera use orthographic projection (camera, size)
        makeFollowPlayer(scene.activeCamera); // locks the camera to the player
        addControls(scene.activeCamera); // adds rotate/zoom controls (also pan if not following player)
        // addFog(0.5, 1.0); // adds fog in the range (start, end)
        // addShader(`shader source`, 1.0); // adds a post-processing shader (shader source, downscale factor)
    },
};

// scene init helpers
function makeBaseCamera(scene) {
    var camera = new BABYLON.ArcRotateCamera('Camera', -Math.PI / 2, Math.PI / 4, bitsy.mapsize / 2, BABYLON.Vector3.Zero(), scene);
    // perspective clipping
    camera.minZ = 0.001;
    camera.maxZ = bitsy.mapsize * 2;
    // zoom
    camera.wheelPrecision = bitsy.mapsize;
    camera.upperRadiusLimit = bitsy.mapsize - 1;
    camera.lowerRadiusLimit = 1;
    return camera;
}
function makeOrthographic(camera, size) {
    camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
    camera.orthoBottom = -size / 2;
    camera.orthoTop = size / 2;
    camera.orthoLeft = -size / 2;
    camera.orthoRight = size / 2;
    camera.minZ = -size * 2;
    camera.maxZ = size * 2;
    camera.upperRadiusLimit = 0.0001;
    camera.lowerRadiusLimit = 0.0001;
}
function makeFollowPlayer(camera) {
    var oldUpdate = camera.update;
    // replace playerRef with playerPosNode to fix billboard crash
    camera.update = function () {
        if (playerPosNode && camera.lockedTarget !== playerPosNode) {
            camera.lockedTarget = playerPosNode;
        } else if (!playerPosNode && camera.lockedTarget) {
            camera.lockedTarget = null;
        }
        oldUpdate.apply(this, arguments);
    };
}
function addShader(fragmentSrc, downScale) {
    BABYLON.Effect.ShadersStore.customFragmentShader = fragmentSrc;

    var postProcess = new BABYLON.PostProcess('customFragmentShader', 'custom', ['screenSize'], null, downScale, scene.activeCamera);
    postProcess.onApply = function (effect) {
        effect.setFloat2('screenSize', postProcess.width, postProcess.height);
    };
}
function addControls(camera) {
    camera.lowerHeightOffsetLimit = 0;
    camera.upperHeightOffsetLimit = bitsy.mapsize / 2;
    camera.upperBetaLimit = Math.PI / 2;
    camera.attachControl(window);
}
function addFog(start, end) {
    scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
    scene.fogDensity = 1.0;
    scene.fogStart = bitsy.mapsize * start;
    scene.fogEnd = bitsy.mapsize * end;
}

var bitsy = window;

var playerPosNode;

var textCanvas;
var textContext;
var fakeContext = {
    drawImage: function () {},
    fillRect: function () {},
};

// remove borksy touch control fix that breaks camera controls
var touchTriggerEl = document.getElementById('touchTrigger');
if (touchTriggerEl) touchTriggerEl.parentElement.removeChild(touchTriggerEl);

// re-initialize the renderer with a scale of 1
// bitsy's upscaling is wasted in 3d
bitsy.renderer = new bitsy.Renderer(bitsy.tilesize, 1);

// prevent dialog box from using position-based rendering
var py;
hacks.kitsy.before('dialogRenderer.DrawTextbox', function () {
    py = bitsy.player().y;
    bitsy.player().y = hackOptions.topDialog ? bitsy.mapsize : 0;
});
hacks.kitsy.after('dialogRenderer.DrawTextbox', function () {
    bitsy.player().y = py;
});

hacks.smooth_moves.ease = function (t) {
    return hackOptions.ease(t);
};

// setup
hacks.kitsy.after('startExportedGame', function () {
    // apply smooth moves hack options
    hacks.smooth_moves.delta = hackOptions.delta;
    hacks.smooth_moves.duration = hackOptions.duration;

    b3d.size = hackOptions.size;
    b3d.clearColor = hackOptions.clearColor;
    b3d.fogColor = hackOptions.fogColor;

    // hide the original canvas and add a stylesheet
    // to make the 3D render in its place
    bitsy.canvas.parentElement.removeChild(bitsy.canvas);
    var style = `html { font-size: 0; } canvas { -ms-interpolation-mode: nearest-neighbor;  image-rendering: -moz-crisp-edges;  image-rendering: pixelated; } canvas:focus { outline: none; } #gameContainer { width: 100vw; max-width: 100vh; margin: auto; } #gameContainer > * { width: 100%; height: 100%; } #gameContainer > #textCanvas { margin-top: -100%; background: none; pointer-events: none; }`;
    var sheet = document.createElement('style');
    sheet.textContent = style;
    document.head.appendChild(sheet);

    var gameContainer = document.createElement('div');
    gameContainer.id = 'gameContainer';
    document.body.appendChild(gameContainer);

    var babylonCanvas = document.createElement('canvas');
    babylonCanvas.id = 'babylonCanvas';
    gameContainer.appendChild(babylonCanvas);

    b3d.init(babylonCanvas);

    textCanvas = document.createElement('canvas');
    textCanvas.id = 'textCanvas';
    textCanvas.width = bitsy.canvas.width;
    textCanvas.height = bitsy.canvas.height;
    gameContainer.appendChild(textCanvas);
    textContext = textCanvas.getContext('2d');
    bitsy.dialogRenderer.AttachContext(textContext);

    playerPosNode = new BABYLON.TransformNode('playerPosNode');

    hackOptions.init(b3d.scene);
});

// input stuff
var rotationTable = {};
rotationTable[bitsy.Direction.Up] = bitsy.Direction.Left;
rotationTable[bitsy.Direction.Left] = bitsy.Direction.Down;
rotationTable[bitsy.Direction.Down] = bitsy.Direction.Right;
rotationTable[bitsy.Direction.Right] = bitsy.Direction.Up;
rotationTable[bitsy.Direction.None] = bitsy.Direction.None;

function rotate(direction) {
    var rotatedDirection = direction;
    var ray = b3d.scene.activeCamera.getForwardRay().direction;
    var ray2 = new BABYLON.Vector2(ray.x, ray.z);
    ray2.normalize();
    var a = (Math.atan2(ray2.y, ray2.x) / Math.PI + 1) * 2 + 0.5;
    if (a < 0) {
        a += 4;
    }
    for (var i = 0; i < a; ++i) {
        rotatedDirection = rotationTable[rotatedDirection];
    }
    return rotatedDirection;
}

var rawDirection = bitsy.Direction.None;
var tankTarget = 0;
var tankFrom = 0;
var tankTime = 0;
hacks.kitsy.before('movePlayer', function () {
    rawDirection = bitsy.curPlayerDirection;
    if (hackOptions.tankControls) {
        if (rawDirection === bitsy.Direction.Left) {
            tankTime = bitsy.prevTime;
            tankFrom = tankTarget;
            tankTarget += Math.PI / 2;
        } else if (rawDirection === bitsy.Direction.Right) {
            tankTime = bitsy.prevTime;
            tankFrom = tankTarget;
            tankTarget -= Math.PI / 2;
        }
    }
    if (hackOptions.cameraRelativeMovement) {
        bitsy.curPlayerDirection = rotate(rawDirection);
    }
    if (tankTime === bitsy.prevTime) {
        bitsy.curPlayerDirection = bitsy.Direction.None;
    }
});
hacks.kitsy.after('movePlayer', function () {
    bitsy.curPlayerDirection = rawDirection;
});

// loop stuff
var dialogDirty = false;
var prevRoom;
hacks.kitsy.after('update', function () {
    if (prevRoom !== bitsy.curRoom) {
        b3d.scene.blockMaterialDirtyMechanism = true;
        b3d.scene.blockfreeActiveMeshesAndRenderingGroups = true;
    }
    b3d.update();
    playerPosNode.position = b3d.playerRef.position;
    if (hackOptions.tankControls) {
        b3d.scene.activeCamera.alpha = tankFrom + (tankTarget - tankFrom) * (1.0 - ((1.0 - Math.min((bitsy.prevTime - tankTime) / 200, 1)) ** 2.0));
    }
    if (prevRoom !== bitsy.curRoom) {
        b3d.scene.blockMaterialDirtyMechanism = false;
        b3d.scene.blockfreeActiveMeshesAndRenderingGroups = false;
        prevRoom = bitsy.curRoom;
    }

    // clear out the text context when not in use
    if (!bitsy.dialogBuffer.IsActive()) {
        if (dialogDirty) {
            textContext.clearRect(0, 0, textCanvas.width, textCanvas.height);
            dialogDirty = false;
        }
    } else {
        dialogDirty = true;
    }
});

// replace 2d rendering with 3d rendering
hacks.kitsy.after('update', function () {
    // clear scene when rendering title/endings
    // using a FOV hack here instead of the engine's clear function
    // in order to ensure post-processing isn't overridden
    var fov = b3d.scene.activeCamera.fov;
    if (bitsy.isNarrating || bitsy.isEnding) {
        b3d.scene.activeCamera.fov = 0;
    }
    b3d.scene.render();
    b3d.scene.activeCamera.fov = fov;
});

}(this.hacks.three = this.hacks.three || {}, window, window.hacks.kitsy));
