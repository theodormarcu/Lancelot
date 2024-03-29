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

    uBlock Origin Original Repository: https://github.com/gorhill/uBlock
*/

'use strict';

/******************************************************************************/

µBlock.contextMenu = (function() {

/******************************************************************************/

if ( vAPI.contextMenu === undefined ) {
    return {
        update: function() {}
    };
}

/******************************************************************************/

var onBlockElement = function(details, tab) {
    if ( tab === undefined ) { return; }
    if ( /^https?:\/\//.test(tab.url) === false ) { return; }
    let tagName = details.tagName || '';
    let src = details.frameUrl || details.srcUrl || details.linkUrl || '';

    if ( !tagName ) {
        if ( typeof details.frameUrl === 'string' ) {
            tagName = 'iframe';
        } else if ( typeof details.srcUrl === 'string' ) {
            if ( details.mediaType === 'image' ) {
                tagName = 'img';
            } else if ( details.mediaType === 'video' ) {
                tagName = 'video';
            } else if ( details.mediaType === 'audio' ) {
                tagName = 'audio';
            }
        } else if ( typeof details.linkUrl === 'string' ) {
            tagName = 'a';
        }
    }

    µBlock.elementPickerExec(tab.id, tagName + '\t' + src);
};

/******************************************************************************/

var onTemporarilyAllowLargeMediaElements = function(details, tab) {
    if ( tab === undefined ) { return; }
    let pageStore = µBlock.pageStoreFromTabId(tab.id);
    if ( pageStore === null ) { return; }
    pageStore.temporarilyAllowLargeMediaElements(true);
};

/******************************************************************************/

var onEntryClicked = function(details, tab) {
    if ( details.menuItemId === 'uBlock0-blockElement' ) {
        return onBlockElement(details, tab);
    }
    if ( details.menuItemId === 'uBlock0-temporarilyAllowLargeMediaElements' ) {
        return onTemporarilyAllowLargeMediaElements(details, tab);
    }
};

/******************************************************************************/

var menuEntries = [
    {
        id: 'uBlock0-blockElement',
        title: vAPI.i18n('pickerContextMenuEntry'),
        contexts: ['all'],
    },
    {
        id: 'uBlock0-temporarilyAllowLargeMediaElements',
        title: vAPI.i18n('contextMenuTemporarilyAllowLargeMediaElements'),
        contexts: ['all'],
    }
];

/******************************************************************************/

var update = function(tabId) {
    let newBits = 0;
    if ( µBlock.userSettings.contextMenuEnabled && tabId !== null ) {
        let pageStore = µBlock.pageStoreFromTabId(tabId);
        if ( pageStore && pageStore.getNetFilteringSwitch() ) {
            newBits |= 0x01;
            if ( pageStore.largeMediaCount !== 0 ) {
                newBits |= 0x02;
            }
        }
    }
    if ( newBits === currentBits ) { return; }
    currentBits = newBits;
    let usedEntries = [];
    if ( newBits & 0x01 ) {
        usedEntries.push(menuEntries[0]);
    }
    if ( newBits & 0x02 ) {
        usedEntries.push(menuEntries[1]);
    }
    vAPI.contextMenu.setEntries(usedEntries, onEntryClicked);
};

var currentBits = 0;

vAPI.contextMenu.onMustUpdate = update;

/******************************************************************************/

return {
    update: function(tabId) {
        if ( µBlock.userSettings.contextMenuEnabled && tabId === undefined ) {
            vAPI.tabs.get(null, function(tab) {
                if ( tab ) {
                    update(tab.id);
                }
            });
            return;
        }
        update(tabId);
    }
};

/******************************************************************************/

})();
