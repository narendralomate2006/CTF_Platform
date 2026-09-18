FROM python:3.12-slim
WORKDIR /app
RUN useradd -r -u 10001 ctf
RUN pip install --no-cache-dir flask==3.1.2
COPY app.py .
USER ctf
EXPOSE 8080
CMD ["python", "app.py"]
