"""A minimal Ogg Opus writer (RFC 3533, RFC 7845): packets go in as they are, nothing is re-encoded.

One logical stream, mono. Opus in Ogg is always timed at 48 kHz, so a 20 ms packet is 960 granule ticks.
"""

import struct

OPUS_TICKS_PER_MS = 48
PRE_SKIP = 312  # libopus's 6.5 ms encoder delay at 48 kHz
PACKETS_PER_PAGE = 50  # one second of 20 ms packets
SERIAL = 0x5D2A1A7E  # one stream per file, so any fixed number will do


def _crc_table() -> list[int]:
    table = []
    for byte in range(256):
        crc = byte << 24
        for _ in range(8):
            crc = ((crc << 1) ^ 0x04C11DB7) & 0xFFFFFFFF if crc & 0x80000000 else (crc << 1) & 0xFFFFFFFF
        table.append(crc)
    return table


_CRC = _crc_table()


def _checksum(data: bytes) -> int:
    crc = 0
    for byte in data:
        crc = ((crc << 8) & 0xFFFFFFFF) ^ _CRC[(crc >> 24) ^ byte]
    return crc


def _page(packets: list[bytes], granule: int, sequence: int, flags: int) -> bytes:
    lacing = bytearray()
    for packet in packets:
        lacing += b"\xff" * (len(packet) // 255) + bytes([len(packet) % 255])
    if len(lacing) > 255:
        raise ValueError("too many packets for one Ogg page")
    header = struct.pack("<4sBBqIIIB", b"OggS", 0, flags, granule, SERIAL, sequence, 0, len(lacing)) + bytes(lacing)
    body = b"".join(packets)
    crc = _checksum(header + body)
    return header[:22] + struct.pack("<I", crc) + header[26:] + body


def opus_head(input_rate: int) -> bytes:
    return b"OpusHead" + struct.pack("<BBHIhB", 1, 1, PRE_SKIP, input_rate, 0, 0)


def opus_tags(vendor: str = "sdrviz") -> bytes:
    name = vendor.encode()
    return b"OpusTags" + struct.pack("<I", len(name)) + name + struct.pack("<I", 0)


def ogg_opus(packets: list[bytes], packet_ms: int = 20, input_rate: int = 8000) -> bytes:
    """The bytes of an Ogg Opus file holding `packets` (each `packet_ms` long) as they are."""
    pages = [
        _page([opus_head(input_rate)], 0, 0, flags=0x02),  # beginning of stream
        _page([opus_tags()], 0, 1, flags=0),
    ]
    step = packet_ms * OPUS_TICKS_PER_MS
    chunks = [packets[i : i + PACKETS_PER_PAGE] for i in range(0, len(packets), PACKETS_PER_PAGE)] or [[]]
    done = 0
    for index, chunk in enumerate(chunks):
        done += len(chunk)
        last = index == len(chunks) - 1
        pages.append(_page(chunk, PRE_SKIP + done * step, 2 + index, flags=0x04 if last else 0))  # end of stream
    return b"".join(pages)
