# Stage 1: Build the React frontend
FROM node:20-slim AS frontend-builder
WORKDIR /frontend
COPY kpi-app/frontend/package*.json ./
RUN npm ci
COPY kpi-app/frontend/ ./
RUN npm run build

# Stage 2: Run the Python backend
FROM python:3.11-slim
WORKDIR /app
COPY kpi-app/backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY kpi-app/backend/ ./
COPY --from=frontend-builder /frontend/dist ./dist
COPY kpi-app/web/ ./web
EXPOSE 8080
CMD ["python", "start.py"]
