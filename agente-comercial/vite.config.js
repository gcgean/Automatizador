import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{proxy:{'/leads':'http://127.0.0.1:3333','/config':'http://127.0.0.1:3333','/inbox':'http://127.0.0.1:3333','/context':'http://127.0.0.1:3333','/conversations':'http://127.0.0.1:3333'}}});
