FROM python:3.12-slim
WORKDIR /app
RUN useradd -r -u 10001 ctf
COPY server.py .
USER ctf
EXPOSE 9000
CMD ["python", "server.py"]
