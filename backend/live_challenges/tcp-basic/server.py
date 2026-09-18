import socket

s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(("0.0.0.0", 9000))
s.listen(20)
while True:
    conn, _ = s.accept()
    conn.sendall(b"OWASP CTF live TCP instance is running.\\n")
    conn.close()
