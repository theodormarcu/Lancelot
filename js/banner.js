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
var BANNER_NORMAL = "This video contains affiliate links. If you click on highlighted links, the creator receives a commission";
var BANNER_COUPON = "This video may contain affiliate marketing content. The creator may make a commission off of clicks to the highlighted portions of the description";
var BUTTON_NORMAL = "Exit";
var BANNER_OPTIONS = {
	"normal": {
		"text": BANNER_NORMAL,
		"button": BUTTON_NORMAL,
	},
	"coupon": {
		"text": BANNER_COUPON,
		"button": BUTTON_NORMAL,
	},
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
        // Add observer
        // addObserver();
        insertBanner();
    }
}

// Insert banner into every HTML page before any other element.
function insertBanner() {
    debug_log("insertBanner() called.");
    if (document.body !== null && !document.getElementById("lancelot-banner")) {
        var bannerConstants = BANNER_OPTIONS['normal'];
        var banner = document.createElement("div");
        banner.innerHTML = "<div id='AdIntuition' style='background-color: red; padding-left:5px; padding-right:10px; padding-bottom:5px; padding-top:1px;'><span style='display:inline-block;'>" + bannerConstants.text + "&nbsp&nbsp</span></div>";
        banner.id = "lancelot-banner";
        debug_log(document.body.firstChild);
        document.body.insertBefore(banner, document.body.firstChild);
        debug_log("insertBanner() finished running.");
    }
}
