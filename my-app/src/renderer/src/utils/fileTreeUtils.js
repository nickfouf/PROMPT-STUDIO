// AI Prompt Builder 2/my-app/src/renderer/src/utils/fileTreeUtils.js
import { FileCode, FileText, FileJson, FileImage, FileVideo, FileAudio, FileArchive, FileSpreadsheet, File } from 'lucide-react';

export const normalizePath = (p) => p.replace(/\\/g, '/');

export const isSubPath = (parentPath, childPath) => {
  const parent = normalizePath(parentPath);
  const child = normalizePath(childPath);
  if (child === parent) return true;
  return child.startsWith(parent + '/');
};

export const findNodeById = (nodes, id) => {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNodeById(n.children, id);
      if (found) return found;
    }
  }
  return null;
};

export const findNode = (nodes, targetPath) => {
  for (const n of nodes) {
    if (normalizePath(n.path) === normalizePath(targetPath)) return n;
    if (n.children) {
      const found = findNode(n.children, targetPath);
      if (found) return found;
    }
  }
  return null;
};

export const updateChildrenPaths = (children, oldParentPath, newParentPath) => {
  if (!children) return undefined;
  return children.map(child => {
    const normOld = normalizePath(oldParentPath);
    const normNew = normalizePath(newParentPath);
    const normChild = normalizePath(child.path);

    const newChildPath = normChild.startsWith(normOld)
      ? normNew + normChild.slice(normOld.length)
      : child.path;

    return {
      ...child,
      path: newChildPath,
      children: updateChildrenPaths(child.children, oldParentPath, newParentPath)
    };
  });
};

const BINARY_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svg', 'tiff',
  'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm',
  'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a',
  'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp',
  'exe', 'dll', 'so', 'dylib', 'bin', 'iso', 'dmg', 'class', 'jar', 'pyc', 'sqlite', 'db'
]);

export const isTextFile = (filename) => {
  if (!filename.includes('.')) return true; // Extensionless files like Dockerfile or Makefile are usually code/text
  const ext = filename.split('.').pop().toLowerCase();
  return !BINARY_EXTS.has(ext);
};

export const getFileIcon = (filename) => {
  if (!filename.includes('.')) return FileCode;
  const ext = filename.split('.').pop().toLowerCase();

  if (['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'php', 'rb', 'sh', 'html', 'css', 'scss', 'vue', 'svelte', 'sql', 'graphql'].includes(ext)) return FileCode;
  if (['json', 'yaml', 'yml', 'xml', 'toml', 'ini', 'env', 'config'].includes(ext)) return FileJson;
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svg', 'tiff'].includes(ext)) return FileImage;
  if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'].includes(ext)) return FileVideo;
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) return FileAudio;
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) return FileArchive;
  if (['xls', 'xlsx', 'csv'].includes(ext)) return FileSpreadsheet;
  if (['pdf', 'doc', 'docx', 'ppt', 'pptx'].includes(ext)) return FileText;
  if (['md', 'txt', 'log'].includes(ext)) return FileText;
  return File;
};