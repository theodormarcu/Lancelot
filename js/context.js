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

/* context.js adds a Content Script that changes the page in order to highlight
ads and other media created by trackers. */

/******************************************************************************/

'use strict';
(function() {

var DEBUG_FLAG = true;
/******************************************************************************/
// Print Only when DEBUG_FLAG is true
function debug_log(text) {
    if (DEBUG_FLAG == true) {
        console.log(text);
    }
}

/******************************************************************************/
function run() {
    debug_log("context run() Called.");
    if (!document.getElementById("lancelot-adbox")) {
        insertAdBox();
    } else {
        removeAdBox();
        insertAdBox();
    }
}
/******************************************************************************/
function insertAdBox() {
    debug_log("insertAdBox() called.");
    if (window.top != window.self)  {
        debug_log("This window is not the topmost window! Am I in a frame?");
        if (document.body !== null && !document.getElementById("lancelot-adbox")) {
            var adbox = document.createElement("div");
            adbox.id = "lancelot-adbox";
            var adbox_wrapper = document.createElement("div");
            adbox_wrapper.id = "lancelot-adbox-wrapper";
            // Create a wrapper: https://stackoverflow.com/questions/1577814/wrapping-a-div-around-the-document-body-contents
            // Move the body's children into this wrapper
            while (document.body.firstChild)
            {
                adbox_wrapper.appendChild(document.body.firstChild);
            }
            // Append the wrapper to the body
            document.body.appendChild(adbox);

            // Create adbox content
            adbox.appendChild(adbox_wrapper);
        }
    } else {
        // Throw out insert().
        debug_log("This window is the topmost window!");
    }
}
/******************************************************************************/


run();

})();
