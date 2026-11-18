import test from 'node:test';import assert from 'node:assert/strict';
import {parseVcf,parseCsv} from '../web/contact-import.js';
test('importação: vCard do Android e iPhone e CSV do Google/Excel',()=>{
 const android='BEGIN:VCARD\r\nVERSION:2.1\r\nN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Souza;Jo=C3=A3o;;;\r\nFN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Jo=C3=A3o Souza\r\nTEL;HOME:85 3333-4444\r\nTEL;CELL:+55 85 99999-1111\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:3.0\r\nN:Lima;Ana;;;\r\nTEL;TYPE=CELL:(88) 98888-2222\r\nEND:VCARD\r\n';
 assert.deepEqual(parseVcf(android),[{name:'João Souza',phone:'+55 85 99999-1111'},{name:'Ana Lima',phone:'(88) 98888-2222'}]);
 const iphone='BEGIN:VCARD\nVERSION:3.0\nFN:Loja do\n  Centro\, Ltda\nitem1.TEL;type=CELL;type=VOICE;type=pref:+55 (11) 97777-3333\nEND:VCARD\n';
 assert.deepEqual(parseVcf(iphone),[{name:'Loja do Centro, Ltda',phone:'+55 (11) 97777-3333'}]);
 const google='Name,Given Name,Phone 1 - Type,Phone 1 - Value\nCarlos Melo,Carlos,Mobile,+55 88 99999-0000 ::: +55 88 3333-0000\n"Silva, Bia",Bia,Mobile,85988887777\n';
 assert.deepEqual(parseCsv(google),[{name:'Carlos Melo',phone:'+55 88 99999-0000 '},{name:'Silva, Bia',phone:'85988887777'}]);
 assert.deepEqual(parseCsv('﻿Nome;Telefone;Empresa\nPedro;(88) 99111-2222;X\n'),[{name:'Pedro',phone:'(88) 99111-2222'}]);
 assert.deepEqual(parseCsv('Marta,88999990000\nJoão,85988880000\n'),[{name:'Marta',phone:'88999990000'},{name:'João',phone:'85988880000'}]);
 assert.deepEqual(parseCsv(''),[]);
});
