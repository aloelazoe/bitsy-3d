function Exporter() {

/* exporting */
function escapeSpecialCharacters(str) {
	str = str.replace(/\\/g, '\\\\');
	str = str.replace(/"/g, '\\"');
	return str;
}

function replaceTemplateMarker(template, marker, text) {
	var markerIndex = template.indexOf( marker );
	return template.substr( 0, markerIndex ) + text + template.substr( markerIndex + marker.length );
}

this.exportGame = function(gameData, title, pageColor, filename, isFixedSize, size) {
	var html = Resources["exportTemplate.html"].substr(); //copy template
	// console.log(html);

	html = replaceTemplateMarker( html, "@@T", title );

	if( isFixedSize ) {
		html = replaceTemplateMarker( html, "@@C", Resources["exportStyleFixed.css"] );
		html = replaceTemplateMarker( html, "@@Z", size + "px" );
	}
	else {
		html = replaceTemplateMarker( html, "@@C", Resources["exportStyleFull.css"] );
	}

	html = replaceTemplateMarker( html, "@@B", pageColor );

	html = replaceTemplateMarker( html, "@@U", Resources["color_util.js"] );
	html = replaceTemplateMarker( html, "@@X", Resources["transition.js"] );
	html = replaceTemplateMarker( html, "@@F", Resources["font.js"] );
	html = replaceTemplateMarker( html, "@@S", Resources["script.js"] );
	html = replaceTemplateMarker( html, "@@L", Resources["dialog.js"] );
	html = replaceTemplateMarker( html, "@@R", Resources["renderer.js"] );
	html = replaceTemplateMarker( html, "@@E", Resources["bitsy.js"] );

	// export the default font in its own script tag (TODO : remove if unused)
	html = replaceTemplateMarker( html, "@@N", "ascii_small" );
	html = replaceTemplateMarker( html, "@@M", fontManager.GetData("ascii_small") );

	html = replaceTemplateMarker( html, "@@D", gameData );

	// console.log(html);

	// include 3d hack
	html = replaceTemplateMarker( html, "@@babylon", Resources["babylon.js"] );
	html = replaceTemplateMarker( html, "@@b3dCore", Resources["b3d-core.js"] );
	html = replaceTemplateMarker( html, "@@kitsy", Resources["kitsy.js"] );
	html = replaceTemplateMarker( html, "@@smoothMoves", Resources["smooth-moves.js"] );
	html = replaceTemplateMarker( html, "@@b3dGame", Resources["b3d-game.js"] );

	ExporterUtils.DownloadFile( filename, html );
}


/* importing */
function unescapeSpecialCharacters(str) {
	str = str.replace(/\\"/g, '"');
	str = str.replace(/\\\\/g, '\\');
	return str;
}

this.importGame = function( html ) {
	console.log("IMPORT!!!");

	// IMPORT : old style
	// find start of game data
	var i = html.indexOf("var exportedGameData");
	if(i > -1) {
		console.log("OLD STYLE");

		while ( html.charAt(i) != '"' ) {
			i++; // move to first quote
		}
		i++; // move past first quote

		// isolate game data
		var gameDataStr = "";
		var isEscapeChar = false;
		while ( html.charAt(i) != '"' || isEscapeChar ) {
			gameDataStr += html.charAt(i);
			isEscapeChar = html.charAt(i) == "\\";
			i++;
		}

		// replace special characters
		gameDataStr = gameDataStr.replace(/\\n/g, "\n"); //todo: move this into the method below
		gameDataStr = unescapeSpecialCharacters( gameDataStr );

		return gameDataStr;		
	}

	// IMPORT : new style
	var scriptStart = '<script type="bitsyGameData" id="exportedGameData">\n';
	var scriptEnd = '</script>';

	// this is kind of embarassing, but I broke import by making the export template pass w3c validation
	// so we have to check for two slightly different versions of the script start line :(
	i = html.indexOf( scriptStart );
	if (i === -1) {
		scriptStart = '<script type="text/bitsyGameData" id="exportedGameData">\n';
		i = html.indexOf( scriptStart );
	}

	if(i > -1) {
		i = i + scriptStart.length;
		var gameStr = "";
		var lineStr = "";
		var isDone = false;
		while(!isDone && i < html.length) {

			lineStr += html.charAt(i);

			if(html.charAt(i) === "\n") {
				if(lineStr === scriptEnd) {
					isDone = true;
				}
				else {
					gameStr += lineStr;
					lineStr = "";
				}
			}

			i++;
		}
		return gameStr;
	}

	console.log("FAIL!!!!");

	return "";
}

} // Exporter()

var ExporterUtils = {
	DownloadFile : function(filename, text) {

		if( browserFeatures.blobURL ) {
			// new blob version
			var a = document.createElement('a');
			var blob = new Blob( [text] );
			a.download = filename;
			a.href = makeURL.createObjectURL(blob);
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
		}
		else {
			// old version
			var element = document.createElement('a');

			element.setAttribute('href', 'data:attachment/file;charset=utf-8,' + encodeURIComponent(text));

			element.setAttribute('download', filename);
			element.setAttribute('target', '_blank');

			element.style.display = 'none';
			document.body.appendChild(element);

			element.click();

			document.body.removeChild(element);
		}
	}
}