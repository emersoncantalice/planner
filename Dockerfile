FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.29-alpine
COPY --from=build /app/dist/planner-frontend /usr/share/nginx/html
ENV PLANNER_API_URL=http://localhost:8080/api
ENV PORT=8080
EXPOSE 8080
CMD ["/bin/sh","-c","printf \"window.__env = window.__env || {};\\nwindow.__env.API_URL = '%s';\\n\" \"$PLANNER_API_URL\" > /usr/share/nginx/html/env.js && printf \"server {\\n  listen %s;\\n  server_name _;\\n  root /usr/share/nginx/html;\\n  index index.html;\\n  location / {\\n    try_files \\$uri \\$uri/ /index.html;\\n  }\\n}\\n\" \"${PORT:-8080}\" > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
