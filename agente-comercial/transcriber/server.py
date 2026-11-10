import json, os, tempfile, threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from faster_whisper import WhisperModel
from audio_conversion import convert_recording, AudioLimitError
model = WhisperModel(os.getenv('WHISPER_MODEL','small'), device='cpu', compute_type='int8', download_root='/models', cpu_threads=4)
lock = threading.Semaphore(1)
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def respond(self, status, value):
        body=json.dumps(value,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def do_GET(self):
        self.respond(200 if self.path=='/health' else 404,{'ready':True,'model':os.getenv('WHISPER_MODEL','small')})
    def do_POST(self):
        if self.path not in ('/transcribe','/convert-audio','/convert-audio-m4a'):return self.respond(404,{'error':'Rota não encontrada'})
        try:size=int(self.headers.get('Content-Length','0'))
        except ValueError:return self.respond(400,{'error':'Tamanho inválido'})
        if size<1 or size>16*1024*1024:return self.respond(413,{'error':'Áudio/vídeo deve ter até 16 MB'})
        if not lock.acquire(timeout=10):return self.respond(503,{'error':'Transcrição ocupada, tente novamente'})
        filename=None
        try:
            with tempfile.NamedTemporaryFile(delete=False,suffix='.media') as f:
                filename=f.name;remaining=size
                while remaining:
                    chunk=self.rfile.read(min(65536,remaining))
                    if not chunk:raise ValueError('Arquivo incompleto')
                    f.write(chunk);remaining-=len(chunk)
            if self.path in ('/convert-audio','/convert-audio-m4a'):
                m4a=self.path=='/convert-audio-m4a'
                output=filename+('.m4a' if m4a else '.ogg')
                try:
                    result,mime=convert_recording(filename,output,m4a=m4a)
                    self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(result)));self.end_headers();self.wfile.write(result);return
                finally:
                    if os.path.exists(output):os.unlink(output)
            segments,info=model.transcribe(filename,language='pt',beam_size=5,vad_filter=True,condition_on_previous_text=False)
            if info.duration>600:return self.respond(413,{'error':'Áudio com mais de dez minutos; arquivo preservado para a equipe'})
            text=' '.join(s.text.strip() for s in segments).strip()
            if len(text)>20000:return self.respond(413,{'error':'Transcrição muito longa; arquivo preservado para a equipe'})
            return self.respond(200,{'text':text,'language':'pt','duration':info.duration})
        except AudioLimitError as error:return self.respond(413,{'error':str(error)})
        except Exception:return self.respond(422,{'error':'Gravação inválida ou sem áudio. Grave novamente e confira a prévia.' if self.path.startswith('/convert-audio') else 'Não foi possível transcrever o áudio deste arquivo'})
        finally:
            if filename:
                try:os.unlink(filename)
                except OSError:pass
            lock.release()
ThreadingHTTPServer(('0.0.0.0',8000),Handler).serve_forever()
