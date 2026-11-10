# Emojis e áudios nas conversas

## Emojis

O botão de rosto sorridente ao lado da caixa de mensagem abre o seletor. Ele inclui busca em português, categorias e emojis recentes salvos no navegador. A seleção é inserida na posição do cursor e substitui o texto selecionado, sem enviar a mensagem. Pressionar Enter na busca escolhe o primeiro resultado; Escape fecha o seletor.

O limite de 4.000 caracteres continua válido. Perfis sem permissão para enviar texto não podem inserir nem enviar emojis. O recurso não altera etiquetas nem adiciona reações a mensagens já enviadas.

## Gravação de áudio

As gravações WebM do navegador e arquivos WAV/OGG enviados pela equipe são convertidos para AAC-LC mono em M4A, a 44,1 kHz, antes do upload à Meta. O arquivo MP4 usa o índice de reprodução no início (fast start), é validado por ffprobe e é enviado com o nome `.m4a` e MIME `audio/mp4`.

A nova rota privada de conversão é `/convert-audio-m4a`. A rota antiga `/convert-audio` permanece disponível durante atualizações para compatibilidade com versões anteriores do backend. Publicar o conversor atualizado antes do backend evita misturar o conteúdo M4A com uma identificação OGG antiga. O backend recusa uma resposta do conversor com o tipo incorreto.

O teste de formato está em `transcriber/test_audio_conversion.py`. Ele usa ffmpeg/ffprobe reais para verificar áudio estéreo WebM convertido em AAC mono, posição do índice de reprodução, decodificação do arquivo, conversão de OGG e rejeição de entrada corrompida. Não depende de mensagens enviadas a clientes.

Áudios enviados antes da atualização não são substituídos no WhatsApp do destinatário. Para testar uma correção, grave e envie um novo áudio. O servidor não reenvia mensagens antigas automaticamente. A reprodução final no dispositivo do destinatário deve ser conferida por ele.
