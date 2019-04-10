/*******************************************************************************

    Lancelot - A child-friendly tracker and ad blocker built on top of uBlock Origin.
    Copyright (C) 2019-present Theodor Marcu. Thanks to Raymond Hill and the uBlock contributors for their work.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/uBlock
*/


'use strict';

/******************************************************************************/

var DEBUG_FLAG = true;
//text constants
var BANNER_NORMAL = "Lancelot dummy text.";
var BUTTON_NORMAL = "Exit";
var BANNER_OPTIONS = {
	"normal": {
		"text": BANNER_NORMAL,
		"button": BUTTON_NORMAL,
	}
}


// Print Only when DEBUG_FLAG is true
function debug_log(text) {
    if (DEBUG_FLAG == true) {
        console.log(text);
    }
}

run();

function run() {
    debug_log("run() Called.");
    if (!document.getElementById("lancelot-banner")) {
        insertBanner();
    } else {
        removeBanner();
        insertBanner();
    }
}

// Insert banner into every HTML page before any other element.
function insertBanner() {
    debug_log("insertBanner() called.");
    if (document.body !== null && !document.getElementById("lancelot-banner")) {
        // Create Banner
        var bannerConstants = BANNER_OPTIONS['normal'];
        var banner = document.createElement("div");
        banner.innerHTML = "<span style='display:inline-block;'>" + bannerConstants.text + "&nbsp&nbsp</span>";
        banner.id = "lancelot-banner";
        var firstChild = document.body.firstChild;
        // Add Banner to Page
        document.body.insertBefore(banner, firstChild);
        // Add Exit Button
        var exitButton = document.createElement("a");
		exitButton.classList.add("exitButton");
		exitButton.innerHTML = bannerConstants.button;
		exitButton.onclick = (function() {removeBanner();})
        document.getElementById("lancelot-banner").appendChild(exitButton);
        debug_log("insertBanner() finished running.");
    }
}

// Remove Banner
function removeBanner() {
	var element = document.getElementById("lancelot-banner");
	if (element) {
    	element.parentNode.removeChild(element);
    }
}
