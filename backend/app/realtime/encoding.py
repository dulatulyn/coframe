from __future__ import annotations

MESSAGE_SYNC = 0
MESSAGE_AWARENESS = 1
MESSAGE_AUTH = 2
MESSAGE_QUERY_AWARENESS = 3
MESSAGE_PERSISTED = 100

SYNC_STEP1 = 0
SYNC_STEP2 = 1
SYNC_UPDATE = 2


class DecodeError(ValueError):
    pass


def encode_var_uint(value: int) -> bytes:
    if value < 0:
        raise ValueError("negative varUint")
    out = bytearray()
    while value > 0x7F:
        out.append(0x80 | (value & 0x7F))
        value >>= 7
    out.append(value)
    return bytes(out)


def encode_var_uint8_array(data: bytes) -> bytes:
    return encode_var_uint(len(data)) + data


def encode_var_string(text: str) -> bytes:
    return encode_var_uint8_array(text.encode("utf-8"))


class Decoder:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.pos = 0

    def done(self) -> bool:
        return self.pos >= len(self.data)

    def read_var_uint(self) -> int:
        result = 0
        shift = 0
        while True:
            if self.pos >= len(self.data):
                raise DecodeError("unexpected end of message")
            byte = self.data[self.pos]
            self.pos += 1
            result |= (byte & 0x7F) << shift
            if byte < 0x80:
                return result
            shift += 7
            if shift > 63:
                raise DecodeError("varUint too long")

    def read_var_uint8_array(self) -> bytes:
        length = self.read_var_uint()
        end = self.pos + length
        if end > len(self.data):
            raise DecodeError("unexpected end of message")
        chunk = self.data[self.pos : end]
        self.pos = end
        return chunk

    def read_var_string(self) -> str:
        return self.read_var_uint8_array().decode("utf-8")


def sync_message(sync_type: int, payload: bytes) -> bytes:
    return encode_var_uint(MESSAGE_SYNC) + encode_var_uint(sync_type) + encode_var_uint8_array(payload)


def awareness_message(update: bytes) -> bytes:
    return encode_var_uint(MESSAGE_AWARENESS) + encode_var_uint8_array(update)


def persisted_message(state_vector: bytes) -> bytes:
    return encode_var_uint(MESSAGE_PERSISTED) + encode_var_uint8_array(state_vector)
