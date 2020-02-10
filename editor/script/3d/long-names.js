document.addEventListener('DOMContentLoaded', function() {
    // make all name boxes wider
    var newStyle = document.createElement('style');
    newStyle.textContent = `
    .nameTextbox {
        width: calc(100% - 70px);
    }
    #drawingName.nameTextbox {
        width: calc(100% - 5px);
        overflow-y: hidden;
    }`;
    document.head.appendChild(newStyle);

    // replace drawing name input element with textarea
    var drawingNameOld = document.getElementById('drawingName');
    var drawingName = createElementFromHTML(`<textarea type="text" id="drawingName" class="nameTextbox" onchange="on_drawing_name_change();" size="10"></textarea>`);
    drawingNameOld.parentNode.replaceChild(drawingName, drawingNameOld);
    // place it between 'name' and 'wall' labels
    var wall = document.getElementById('wall');
    wall.parentNode.insertBefore(drawingName, wall);
    // adjust its height automatically
    updateDrawingNameStyle();
    patchGlobalFunction('updateDrawingNameUI', updateDrawingNameStyle);
    patchGlobalFunction('on_drawing_name_change', updateDrawingNameStyle);
    drawingName.addEventListener('input', updateDrawingNameStyle);

    // place room name box right after the 'room tools' button,
    // and add a linebreak
    // so that it doesn't obscure other buttons
    var roomNameBoxEl = document.getElementById('roomNav').childNodes[1];
    document.getElementById('roomTools')
        .insertBefore(
            roomNameBoxEl,
            document.getElementById('roomNav')
        );
    document.getElementById('roomTools')
        .insertBefore(document.createElement('br'), roomNameBoxEl.nextSibling);

    function updateDrawingNameStyle() {
        drawingName.style.height = 'auto';
        drawingName.style.height = (drawingName.scrollHeight) + 'px';
    }
    function createElementFromHTML(htmlString) {
        var div = document.createElement('div');
        div.innerHTML = htmlString.trim();
        return div.firstChild;
    }
    function patchGlobalFunction(name, after) {
        var oldFunc = window[name];
        window[name] = function (arg) {
            oldFunc.call(null, arg);
            after.call(null, arg);
        };
    }
});