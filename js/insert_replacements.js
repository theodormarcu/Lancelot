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
