/**
 * Asset Management Script Generators
 *
 * Generates ES3-compatible ExtendScript for asset management operations.
 */

import {
  escapeString,
  generateProjectCheck,
  generateCompAccess,
  wrapInUndoGroup,
  generateResultObject
} from './helpers.js';

/**
 * Generate script to import a folder of footage
 */
export function generateImportFolder(params: {
  path: string;
  recursive?: boolean;
}): string {
  let script = '';
  script += generateProjectCheck();

  script += 'var folder = new Folder("' + escapeString(params.path) + '");\n';
  script += 'if (!folder.exists) {\n';
  script += '  throw new Error("Folder not found: ' + escapeString(params.path) + '");\n';
  script += '}\n';

  script += 'var importedItems = [];\n';

  script += 'function importFilesFromFolder(f, parentFolder) {\n';
  script += '  var files = f.getFiles();\n';
  script += '  for (var i = 0; i < files.length; i++) {\n';
  script += '    var file = files[i];\n';
  script += '    if (file instanceof Folder) {\n';

  if (params.recursive) {
    script += '      var subFolder = app.project.items.addFolder(file.name);\n';
    script += '      if (parentFolder) subFolder.parentFolder = parentFolder;\n';
    script += '      importFilesFromFolder(file, subFolder);\n';
  }

  script += '    } else if (file instanceof File) {\n';
  script += '      try {\n';
  script += '        var importOptions = new ImportOptions(file);\n';
  script += '        var imported = app.project.importFile(importOptions);\n';
  script += '        if (parentFolder) imported.parentFolder = parentFolder;\n';
  script += '        importedItems.push({ id: imported.id, name: imported.name });\n';
  script += '      } catch (e) {\n';
  script += '        // Skip unsupported files\n';
  script += '      }\n';
  script += '    }\n';
  script += '  }\n';
  script += '}\n';

  script += 'var rootFolder = app.project.items.addFolder(folder.name);\n';
  script += 'importFilesFromFolder(folder, rootFolder);\n';

  script += 'var result = ({\n';
  script += '  folderId: rootFolder.id,\n';
  script += '  folderName: rootFolder.name,\n';
  script += '  importedCount: importedItems.length,\n';
  script += '  items: importedItems\n';
  script += '});\n';
  script += 'result;\n';

  return wrapInUndoGroup(script, 'Import Folder');
}

/**
 * Generate script to replace footage
 */
export function generateReplaceFootage(params: {
  itemId?: number;
  itemName?: string;
  newPath: string;
}): string {
  let script = '';
  script += generateProjectCheck();

  // Find the item
  if (params.itemId) {
    script += 'var item = app.project.itemByID(' + params.itemId + ');\n';
  } else if (params.itemName) {
    script += 'var item = null;\n';
    script += 'for (var i = 1; i <= app.project.numItems; i++) {\n';
    script += '  if (app.project.item(i).name === "' + escapeString(params.itemName) + '") {\n';
    script += '    item = app.project.item(i);\n';
    script += '    break;\n';
    script += '  }\n';
    script += '}\n';
  }

  script += 'if (!item) {\n';
  script += '  throw new Error("Item not found");\n';
  script += '}\n';

  script += 'if (!(item instanceof FootageItem)) {\n';
  script += '  throw new Error("Item is not a footage item");\n';
  script += '}\n';

  script += 'var newFile = new File("' + escapeString(params.newPath) + '");\n';
  script += 'if (!newFile.exists) {\n';
  script += '  throw new Error("New file not found: ' + escapeString(params.newPath) + '");\n';
  script += '}\n';

  script += 'item.replace(newFile);\n';

  script += generateResultObject({
    success: 'true',
    itemId: 'item.id',
    itemName: 'item.name',
    newPath: '"' + escapeString(params.newPath) + '"'
  });

  return wrapInUndoGroup(script, 'Replace Footage');
}

/**
 * Generate script to organize project items
 */
export function generateOrganizeProjectItems(params: {
  structure?: string;
  customFolders?: string[];
}): string {
  let script = '';
  script += generateProjectCheck();

  const structure = params.structure || 'type';

  script += 'var organizedCount = 0;\n';

  if (structure === 'type') {
    // Create folders by type
    script += 'var compsFolder = null;\n';
    script += 'var footageFolder = null;\n';
    script += 'var solidsFolder = null;\n';

    script += 'for (var i = 1; i <= app.project.numItems; i++) {\n';
    script += '  var item = app.project.item(i);\n';
    script += '  if (item instanceof FolderItem) continue;\n';
    script += '  if (item.parentFolder !== app.project.rootFolder) continue;\n';

    script += '  if (item instanceof CompItem) {\n';
    script += '    if (!compsFolder) {\n';
    script += '      compsFolder = app.project.items.addFolder("Compositions");\n';
    script += '    }\n';
    script += '    item.parentFolder = compsFolder;\n';
    script += '    organizedCount++;\n';
    script += '  } else if (item instanceof FootageItem) {\n';
    script += '    if (item.mainSource instanceof SolidSource) {\n';
    script += '      if (!solidsFolder) {\n';
    script += '        solidsFolder = app.project.items.addFolder("Solids");\n';
    script += '      }\n';
    script += '      item.parentFolder = solidsFolder;\n';
    script += '    } else {\n';
    script += '      if (!footageFolder) {\n';
    script += '        footageFolder = app.project.items.addFolder("Footage");\n';
    script += '      }\n';
    script += '      item.parentFolder = footageFolder;\n';
    script += '    }\n';
    script += '    organizedCount++;\n';
    script += '  }\n';
    script += '}\n';
  } else if (structure === 'usage') {
    // Create folders for used and unused items
    script += 'var usedFolder = app.project.items.addFolder("Used");\n';
    script += 'var unusedFolder = app.project.items.addFolder("Unused");\n';

    script += 'for (var i = 1; i <= app.project.numItems; i++) {\n';
    script += '  var item = app.project.item(i);\n';
    script += '  if (item instanceof FolderItem) continue;\n';
    script += '  if (item.parentFolder !== app.project.rootFolder) continue;\n';

    script += '  if (item.usedIn && item.usedIn.length > 0) {\n';
    script += '    item.parentFolder = usedFolder;\n';
    script += '  } else {\n';
    script += '    item.parentFolder = unusedFolder;\n';
    script += '  }\n';
    script += '  organizedCount++;\n';
    script += '}\n';
  } else if (structure === 'custom' && params.customFolders) {
    // Create custom folders
    script += 'var folders = {};\n';
    for (let i = 0; i < params.customFolders.length; i++) {
      const folderName = params.customFolders[i];
      script += 'folders["' + escapeString(folderName) + '"] = app.project.items.addFolder("' + escapeString(folderName) + '");\n';
    }
  }

  script += generateResultObject({
    success: 'true',
    organizedCount: 'organizedCount'
  });

  return wrapInUndoGroup(script, 'Organize Project');
}

/**
 * Generate script to find missing footage
 */
export function generateFindMissingFootage(): string {
  let script = '';
  script += generateProjectCheck();

  script += 'var missingItems = [];\n';

  script += 'for (var i = 1; i <= app.project.numItems; i++) {\n';
  script += '  var item = app.project.item(i);\n';
  script += '  if (item instanceof FootageItem) {\n';
  script += '    if (item.footageMissing) {\n';
  script += '      var info = {};\n';
  script += '      info.id = item.id;\n';
  script += '      info.name = item.name;\n';
  script += '      if (item.file) {\n';
  script += '        info.path = item.file.fsName;\n';
  script += '      }\n';
  script += '      missingItems.push(info);\n';
  script += '    }\n';
  script += '  }\n';
  script += '}\n';

  script += 'var result = {};\n';
  script += 'result.missingCount = missingItems.length;\n';
  script += 'result.items = missingItems;\n';
  script += 'result;\n';

  return script;
}

/**
 * Generate script to collect files
 */
export function generateCollectFiles(params: {
  outputPath: string;
  includeFootage?: boolean;
  includeFonts?: boolean;
}): string {
  let script = '';
  script += generateProjectCheck();

  // Note: AE's collectFiles is limited in scripting
  // This creates a manual collection

  script += 'var outputFolder = new Folder("' + escapeString(params.outputPath) + '");\n';
  script += 'if (!outputFolder.exists) {\n';
  script += '  outputFolder.create();\n';
  script += '}\n';

  script += 'var collectedFiles = [];\n';

  if (params.includeFootage !== false) {
    script += 'var footageFolder = new Folder(outputFolder.fsName + "/footage");\n';
    script += 'footageFolder.create();\n';

    script += 'for (var i = 1; i <= app.project.numItems; i++) {\n';
    script += '  var item = app.project.item(i);\n';
    script += '  if (item instanceof FootageItem && item.file) {\n';
    script += '    try {\n';
    script += '      var srcFile = item.file;\n';
    script += '      var destFile = new File(footageFolder.fsName + "/" + srcFile.name);\n';
    script += '      if (srcFile.copy(destFile.fsName)) {\n';
    script += '        collectedFiles.push(srcFile.name);\n';
    script += '      }\n';
    script += '    } catch (e) {}\n';
    script += '  }\n';
    script += '}\n';
  }

  // Save project to output folder
  script += 'var projectFile = new File(outputFolder.fsName + "/" + (app.project.file ? app.project.file.name : "collected_project.aep"));\n';
  script += 'app.project.save(projectFile);\n';

  script += 'var result = ({\n';
  script += '  outputPath: outputFolder.fsName,\n';
  script += '  collectedCount: collectedFiles.length,\n';
  script += '  files: collectedFiles\n';
  script += '});\n';
  script += 'result;\n';

  return wrapInUndoGroup(script, 'Collect Files');
}

/**
 * Generate script to reduce project to used items
 */
export function generateReduceProject(params: {
  compId?: number;
  compName?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  script += 'app.project.reduceProject([comp]);\n';

  script += generateResultObject({
    success: 'true',
    compName: 'comp.name',
    remainingItems: 'app.project.numItems'
  });

  return wrapInUndoGroup(script, 'Reduce Project');
}

/**
 * Generate script to set proxy for footage
 */
export function generateSetProxy(params: {
  itemId?: number;
  itemName?: string;
  proxyPath: string;
}): string {
  let script = '';
  script += generateProjectCheck();

  // Find the item
  if (params.itemId) {
    script += 'var item = app.project.itemByID(' + params.itemId + ');\n';
  } else if (params.itemName) {
    script += 'var item = null;\n';
    script += 'for (var i = 1; i <= app.project.numItems; i++) {\n';
    script += '  if (app.project.item(i).name === "' + escapeString(params.itemName) + '") {\n';
    script += '    item = app.project.item(i);\n';
    script += '    break;\n';
    script += '  }\n';
    script += '}\n';
  }

  script += 'if (!item) {\n';
  script += '  throw new Error("Item not found");\n';
  script += '}\n';

  script += 'var proxyFile = new File("' + escapeString(params.proxyPath) + '");\n';
  script += 'if (!proxyFile.exists) {\n';
  script += '  throw new Error("Proxy file not found: ' + escapeString(params.proxyPath) + '");\n';
  script += '}\n';

  script += 'item.setProxy(proxyFile);\n';

  script += generateResultObject({
    success: 'true',
    itemName: 'item.name',
    proxyPath: '"' + escapeString(params.proxyPath) + '"'
  });

  return wrapInUndoGroup(script, 'Set Proxy');
}

/**
 * Generate script to remove proxy
 */
export function generateRemoveProxy(params: {
  itemId?: number;
  itemName?: string;
}): string {
  let script = '';
  script += generateProjectCheck();

  // Find the item
  if (params.itemId) {
    script += 'var item = app.project.itemByID(' + params.itemId + ');\n';
  } else if (params.itemName) {
    script += 'var item = null;\n';
    script += 'for (var i = 1; i <= app.project.numItems; i++) {\n';
    script += '  if (app.project.item(i).name === "' + escapeString(params.itemName) + '") {\n';
    script += '    item = app.project.item(i);\n';
    script += '    break;\n';
    script += '  }\n';
    script += '}\n';
  }

  script += 'if (!item) {\n';
  script += '  throw new Error("Item not found");\n';
  script += '}\n';

  script += 'item.setProxyToNone();\n';

  script += generateResultObject({
    success: 'true',
    itemName: 'item.name'
  });

  return wrapInUndoGroup(script, 'Remove Proxy');
}
