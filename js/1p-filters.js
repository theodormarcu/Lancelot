/*******************************************************************************

    Lancelot - A child-friendly tracker and ad blocker built on top of uBlock Origin.
    Copyright (C) 2014-2018 Raymond Hill

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

/* global CodeMirror, uDom, uBlockDashboard */

'use strict';

/******************************************************************************/

(function() {

/******************************************************************************/

const messaging = vAPI.messaging;
const cmEditor = new CodeMirror(
    document.getElementById('userFilters'),
    {
        autofocus: true,
        lineNumbers: true,
        lineWrapping: true,
        styleActiveLine: true
    }
);

uBlockDashboard.patchCodeMirrorEditor(cmEditor);

let cachedUserFilters = '';

/******************************************************************************/

// https://github.com/gorhill/uBlock/issues/3706
//   Save/restore cursor position
//
// CoreMirror reference: https://codemirror.net/doc/manual.html#api_selection

window.addEventListener('beforeunload', ( ) => {
    vAPI.localStorage.setItem(
        'myFiltersCursorPosition',
        JSON.stringify(cmEditor.getCursor().line)
    );
});


/******************************************************************************/

// This is to give a visual hint that the content of user blacklist has changed.

const userFiltersChanged = function(changed) {
    if ( typeof changed !== 'boolean' ) {
        changed = cmEditor.getValue().trim() !== cachedUserFilters;
    }
    uDom.nodeFromId('userFiltersApply').disabled = !changed;
    uDom.nodeFromId('userFiltersRevert').disabled = !changed;
};

/******************************************************************************/

const renderUserFilters = function(first) {
    const onRead = function(details) {
        if ( details.error ) { return; }
        let content = details.content.trim();
        cachedUserFilters = content;
        if ( content.length !== 0 ) {
            content += '\n';
        }
        cmEditor.setValue(content);
        if ( first ) {
            cmEditor.clearHistory();
            try {
                const line = JSON.parse(
                    vAPI.localStorage.getItem('myFiltersCursorPosition')
                );
                if ( typeof line === 'number' ) {
                    cmEditor.setCursor(line, 0);
                }
            } catch(ex) {
            }
        }
        userFiltersChanged(false);
    };
    messaging.send('dashboard', { what: 'readUserFilters' }, onRead);
};

/******************************************************************************/

const allFiltersApplyHandler = function() {
    messaging.send('dashboard', { what: 'reloadAllFilters' });
    uDom('#userFiltersApply').prop('disabled', true );
};

/******************************************************************************/

const handleImportFilePicker = function() {
    // https://github.com/chrisaljoudi/uBlock/issues/1004
    // Support extraction of filters from ABP backup file
    const abpImporter = function(s) {
        const reAbpSubscriptionExtractor = /\n\[Subscription\]\n+url=~[^\n]+([\x08-\x7E]*?)(?:\[Subscription\]|$)/ig;
        const reAbpFilterExtractor = /\[Subscription filters\]([\x08-\x7E]*?)(?:\[Subscription\]|$)/i;
        let matches = reAbpSubscriptionExtractor.exec(s);
        // Not an ABP backup file
        if ( matches === null ) { return s; }
        // 
        const out = [];
        while ( matches !== null ) {
            if ( matches.length === 2 ) {
                let filterMatch = reAbpFilterExtractor.exec(matches[1].trim());
                if ( filterMatch !== null && filterMatch.length === 2 ) {
                    out.push(filterMatch[1].trim().replace(/\\\[/g, '['));
                }
            }
            matches = reAbpSubscriptionExtractor.exec(s);
        }
        return out.join('\n');
    };

    const fileReaderOnLoadHandler = function() {
        const sanitized = abpImporter(this.result);
        cmEditor.setValue(cmEditor.getValue().trim() + '\n' + sanitized);
    };
    const file = this.files[0];
    if ( file === undefined || file.name === '' ) { return; }
    if ( file.type.indexOf('text') !== 0 ) { return; }
    const fr = new FileReader();
    fr.onload = fileReaderOnLoadHandler;
    fr.readAsText(file);
};

/******************************************************************************/

const startImportFilePicker = function() {
    const input = document.getElementById('importFilePicker');
    // Reset to empty string, this will ensure an change event is properly
    // triggered if the user pick a file, even if it is the same as the last
    // one picked.
    input.value = '';
    input.click();
};

/******************************************************************************/

const exportUserFiltersToFile = function() {
    const val = cmEditor.getValue().trim();
    if ( val === '' ) { return; }
    const filename = vAPI.i18n('1pExportFilename')
        .replace('{{datetime}}', uBlockDashboard.dateNowToSensibleString())
        .replace(/ +/g, '_');
    vAPI.download({
        'url': 'data:text/plain;charset=utf-8,' + encodeURIComponent(val + '\n'),
        'filename': filename
    });
};

/******************************************************************************/

const applyChanges = function() {
    messaging.send(
        'dashboard',
        {
            what: 'writeUserFilters',
            content: cmEditor.getValue()
        },
        details => {
            if ( details.error ) { return; }
            cachedUserFilters = details.content.trim();
            allFiltersApplyHandler();
        }
    );
};

const revertChanges = function() {
    let content = cachedUserFilters;
    if ( content.length !== 0 ) {
        content += '\n';
    }
    cmEditor.setValue(content);
};

/******************************************************************************/

const getCloudData = function() {
    return cmEditor.getValue();
};

const setCloudData = function(data, append) {
    if ( typeof data !== 'string' ) { return; }
    if ( append ) {
        data = uBlockDashboard.mergeNewLines(cmEditor.getValue(), data);
    }
    cmEditor.setValue(data);
};

self.cloud.onPush = getCloudData;
self.cloud.onPull = setCloudData;

/******************************************************************************/

// Handle user interaction
uDom('#importUserFiltersFromFile').on('click', startImportFilePicker);
uDom('#importFilePicker').on('change', handleImportFilePicker);
uDom('#exportUserFiltersToFile').on('click', exportUserFiltersToFile);
uDom('#userFiltersApply').on('click', applyChanges);
uDom('#userFiltersRevert').on('click', revertChanges);

renderUserFilters(true);

cmEditor.on('changes', userFiltersChanged);
CodeMirror.commands.save = applyChanges;

/******************************************************************************/

})();
