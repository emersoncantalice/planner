FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.29-alpine
COPY --from=build /app/dist/planner-frontend /usr/share/nginx/html
ENV PLANNER_API_URL=http://localhost:8080/api
EXPOSE 80
CMD ["/bin/sh","-c","printf \"window.__env = window.__env || {};\\nwindow.__env.API_URL = '%s';\\n\" \"$PLANNER_API_URL\" > /usr/share/nginx/html/env.js && exec nginx -g 'daemon off;'"]
