const {contextBridge,ipcRenderer} = require('electron');
const invoke = name => (...args) => ipcRenderer.invoke(`nexo:${name}`,...args);
contextBridge.exposeInMainWorld('nexo', {
  bounds:invoke('bounds'),visible:invoke('visible'),navigate:invoke('navigate'),back:invoke('back'),reload:invoke('reload'),
  config:invoke('config'),getConfig:invoke('get-config'),approve:invoke('approve'),stop:invoke('stop'),run:invoke('run'),
  resetConversation:invoke('reset-conversation'),
  saveGuidance:invoke('save-guidance'),
  testConnection:invoke('test-connection'),
  getChatState:invoke('get-chat-state'),listChats:invoke('list-chats'),newChat:invoke('new-chat'),openChat:invoke('open-chat'),renameChat:invoke('rename-chat'),saveChatDraft:invoke('chat-draft'),openChatsFolder:invoke('open-chats-folder'),
  subscribe:callback => {const listener=(_event,data)=>callback(data);ipcRenderer.on('nexo:event',listener);return ()=>ipcRenderer.removeListener('nexo:event',listener);}
});
