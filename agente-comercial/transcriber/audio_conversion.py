import json
import math
import subprocess


class AudioLimitError(ValueError):
    pass


def convert_recording(source, output, m4a=True):
    """Decode recorder input, then validate a complete, single-channel delivery file."""
    encoding = (['-c:a', 'aac', '-profile:a', 'aac_low', '-ac', '1', '-ar', '44100',
                 '-b:a', '64k', '-movflags', '+faststart', '-f', 'ipod'] if m4a else
                ['-c:a', 'libopus', '-ac', '1', '-b:a', '48k'])
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', source, '-map', '0:a:0',
                    '-vn', '-t', '601', *encoding, '-y', output],
                   capture_output=True, timeout=90, check=True)
    probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
                            'stream=codec_name,channels:format=duration', '-of', 'json', output],
                           capture_output=True, text=True, timeout=20, check=True)
    metadata = json.loads(probe.stdout)
    duration = float(metadata['format']['duration'])
    streams = metadata.get('streams', [])
    if (not math.isfinite(duration) or len(streams) != 1 or
            streams[0].get('codec_name') != ('aac' if m4a else 'opus') or
            streams[0].get('channels') != 1):
        raise ValueError('Formato convertido inválido')
    if duration > 600:
        raise AudioLimitError('Gravação deve ter até dez minutos')
    if duration < 0.15:
        raise ValueError('Gravação curta demais')
    with open(output, 'rb') as converted:
        data = converted.read(16 * 1024 * 1024 + 1)
    if len(data) > 16 * 1024 * 1024:
        raise AudioLimitError('Áudio convertido excede 16 MB')
    if not data:
        raise ValueError('Áudio convertido vazio')
    return data, 'audio/mp4' if m4a else 'audio/ogg'
