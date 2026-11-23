# Vídeos, demonstrações e transcrição

Em **Configurações → Vídeos e demonstrações**, o administrador cadastra conteúdo exclusivo da conexão. Vendedores com acesso à conexão consultam somente as demonstrações liberadas. Não há compartilhamento automático entre empresas ou números.

## Cadastrar e transcrever

1. Informe título, produto e finalidade: apresentação geral, recurso ou primeiros passos.
2. Cadastre o link do YouTube e/ou envie o arquivo original. É possível usar apenas a transcrição, sem publicar uma demonstração.
3. **Salvar e transcrever** recebe MP4/WebM ou áudio MP3/M4A/OGG/WAV, até 64 MB e dez minutos. Há fila persistente de processamento. Limite de arquivos de 2 GB por conexão, incluindo versões anteriores preservadas. Até 200 cadastros por conexão.
4. O serviço transcreve a fala com tempos. A IA configurada na conexão prepara um rascunho de resumo, assuntos, dúvidas e capítulos, sem executar ferramentas. Se a análise falhar, a transcrição e o original ficam disponíveis. É possível baixar TXT, editar o texto, importar TXT/SRT/VTT ou gerar novamente o resumo.
5. Revise o conteúdo, acrescente etapas visuais e limites e informe a versão demonstrada. A transcrição não analisa a tela; não comprova botões, etapas visuais ou recursos não narrados. O resumo automático pode conter erros e não é publicado sozinho.

Um link do YouTube sozinho não autoriza baixar o vídeo nem garante uma transcrição. Nesta versão, envie o original ou importe legendas autorizadas. Não há download automático de vídeos/legendas do YouTube. A conexão de comentários do YouTube é um recurso separado.

## Liberação e privacidade

Para liberar, é necessário resumo, uma fonte reproduzível e confirmação de revisão e acesso público por link. Somente administradores publicam. Sem YouTube, o original enviado será utilizado na reprodução pública. Use demonstrações com dados fictícios; não publique dados de clientes, senhas, tokens ou operações reais. O texto integral da transcrição fica na área administrativa e não é renderizado na página pública.

Alterar o conteúdo, enviar outro arquivo, pedir nova análise ou retirar de uso despublica a demonstração. A edição usa controle de versão. Links individuais antigos deixam de abrir quando a versão muda. Retirar de uso preserva o histórico. O arquivo privado só pode ser lido por usuários autorizados; a rota pública exige demonstração publicada e empresa/conexão ativas.

## Uso pela HELENA e vendedores

A ferramenta `buscar_demonstracao` seleciona material liberado na conexão, com base na dúvida, produto, assuntos, perguntas, resumo e transcrição. Não escolhe um módulo aleatório para uma pergunta genérica. Retorna no máximo um vídeo e um trecho pertinente quando há tempos disponíveis. A busca usa correspondência de termos e a pergunta formulada pela IA; não é uma garantia de compreensão semântica perfeita.

Links individuais `/assistir/:token` associam demonstração e conversa, têm validade de 30 dias e preservam a versão revisada. A IA evita repetir uma versão já enviada, salvo pedido expresso para reenviar. Pedidos de atendimento humano/ligação continuam prioritários. Bloqueio, recusa e encerramento impedem gerar novos links pela IA. Vendedores também podem copiar a página pública, mas esse endereço genérico não identifica o lead nem gera acompanhamento individual.

Vídeos não atualizam preços, condições, disponibilidade ou requisitos por si mesmos. O catálogo confirmado continua sendo a referência comercial. Não anunciar recursos de outra conexão com base em um vídeo.

## Reprodução e acompanhamento

A página pública usa player do YouTube ou o original liberado, com capítulos e botão de teste quando há produto e teste confirmados. O botão preserva o vínculo com o lead quando o acesso veio de link individual. Em caso de bloqueio de incorporação, é possível abrir o YouTube diretamente.

São registrados acesso à página, início, posições de 25/50/75% e chegada ao final, sem repetição do mesmo evento por link. Posições podem incluir avanço manual; chegada ao final não significa que todo o vídeo foi assistido. Verificadores de links podem gerar acessos. Eventos são observações do navegador, sem prova da identidade de quem assistiu, compreensão, cadastro ou contratação. O painel da biblioteca mostra os totais e a conversa mostra os últimos cinco envios individuais.

## Cadência

Após publicar a primeira demonstração, **Preparar modelo de vídeo** cadastra `comercial_video_demonstracao_v1` na WABA da conexão, sem enviar mensagens. **Consultar modelo da Meta** mostra o status. Somente o modelo aprovado e compatível é usado; pendência/rejeição não é contornada com texto livre. Um único parâmetro de corpo recebe o link individual.

O convite ao produto e as etapas de cadastro existentes mantêm sua prioridade. A demonstração entra quando pertinente, sem repetir vídeo já enviado nem enviar mais de um vídeo no ciclo sem nova mensagem do cliente. Recusa, janela do canal, estado humano, limites e pendências da cadência continuam sendo conferidos antes do envio.

## Operação técnica

Arquivos são armazenados em `DATA_DIR/demonstrations`, com nomes UUID e permissão privada. Não há download a partir de URLs arbitrárias. Upload é transmitido ao disco com limite de tamanho, cota e versão; não passa pelo caminho de anexos privados das conversas. Jobs usam captura persistente e revalidação de versão. Reinício reprograma processamento interrompido; falhas transitórias têm até três tentativas.

`DEMONSTRATION_TRANSCRIBER_URL` aponta para serviço dedicado à biblioteca; na ausência, usa `TRANSCRIBER_URL`. A composição de produção adiciona `demonstration-transcriber`, com o modelo Whisper compartilhado no cache e recursos limitados, sem reiniciar o transcritor dos atendimentos. O endpoint interno `/transcribe-library` retorna texto e segmentos. O serviço de áudio de conversas mantém os limites e resposta anteriores.

Testes usam PostgreSQL isolado, arquivos e fala sintéticos e APIs simuladas. Nenhuma mensagem a clientes nem reserva real faz parte da validação. Referência do player: https://developers.google.com/youtube/iframe_api_reference.
