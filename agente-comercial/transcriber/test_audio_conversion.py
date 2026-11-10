import json
import math
import struct
import subprocess
import tempfile
import unittest
import wave
from pathlib import Path
from audio_conversion import convert_recording


class AudioConversionTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        self.source = self.root / 'recording.wav'
        with wave.open(str(self.source), 'wb') as audio:
            audio.setnchannels(2)
            audio.setsampwidth(2)
            audio.setframerate(16000)
            audio.writeframes(b''.join(struct.pack('<hh', int(2000 * math.sin(i * .17)),
                                                   int(1500 * math.sin(i * .19)))
                                       for i in range(16000)))

    def tearDown(self):
        self.folder.cleanup()

    def test_recorder_webm_becomes_seekable_mono_aac_m4a(self):
        webm = self.root / 'recorder.webm'
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(self.source), '-c:a', 'libopus',
                        '-f', 'webm', str(webm)], check=True)
        target = self.root / 'delivery.m4a'
        data, mime = convert_recording(str(webm), str(target))
        self.assertEqual(mime, 'audio/mp4')
        self.assertLess(data.index(b'moov'), data.index(b'mdat'))
        details = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
                              'stream=codec_name,channels,sample_rate:format=duration',
                              '-of', 'json', str(target)]))
        self.assertEqual(details['streams'][0]['codec_name'], 'aac')
        self.assertEqual(details['streams'][0]['channels'], 1)
        self.assertEqual(details['streams'][0]['sample_rate'], '44100')
        self.assertGreater(float(details['format']['duration']), .9)
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(target), '-f', 'null', '-'], check=True)

    def test_original_ogg_can_be_converted_for_aac_delivery(self):
        ogg = self.root / 'legacy.ogg'
        _, mime = convert_recording(str(self.source), str(ogg), m4a=False)
        self.assertEqual(mime, 'audio/ogg')
        data, mime = convert_recording(str(ogg), str(self.root / 'converted.m4a'))
        self.assertEqual(mime, 'audio/mp4')
        self.assertGreater(len(data), 1000)

    def test_corrupt_input_is_rejected(self):
        invalid = self.root / 'bad.webm'
        invalid.write_bytes(b'not an audio file')
        with self.assertRaises(subprocess.CalledProcessError):
            convert_recording(str(invalid), str(self.root / 'bad.m4a'))


if __name__ == '__main__':
    unittest.main()
