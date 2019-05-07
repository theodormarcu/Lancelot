/*******************************************************************************

    Lancelot - A child-friendly tracker and ad blocker built on top of uBlock Origin.
    Copyright (C) 2019-present Theodor Marcu. Thanks to Raymond Hill and the
    uBlock contributors for their work.

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

    uBlock Origin Original Repository: https://github.com/gorhill/uBlock

    // This script is inserted into every page and replaces images with ads.
    // This approach is inspired by CatBlock: https://github.com/CatBlock/catblock
/******************************************************************************/



console.log("ELEMENT INJECTION");
for (ix in selectorArr) {
    try {
        let selector = selectorArr[ix];
        element = document.querySelector(selector);
    } catch(error) {
        continue;
    }
    if (element && element.nodeType == 1) {
        element.className += ' ublock_elem';
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
        let coverElem = document.createElement('img');
        coverElem.classList.add("injected_image");
        // Inspired by CatBlock by AdBlock.
        var css = {
            // width: element.offsetWidth + "px",
            // height: element.offsetHeight + "px",
            width: "100%",
            height: "auto",
            background: "url(" + imgUrl + ") ! important",
            backgroundPosition: "-" + element.offsetLeft + "px -" + element.offsettop + "px",
            // backgroundSize: element.x + "px " + element.y + "px",
            margin: element.offsettop + "px " + element.offsetleft + "px",
            // nytimes.com float:right ad at top is on the left without this
            "float": (window.getComputedStyle(element).float || undefined)
        };
        console.log(css);
        for (var k in css) {
            coverElem.style[k] = css[k];
        }
        coverElem.src = imgUrl;
        coverElem.id = 'coverElem';
        element.appendChild(coverElem);
        console.log(coverElem);
        // element.parentNode.insertBefore(coverElem, element);
    }
}
