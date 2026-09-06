FROM node:22-alpine AS frontend-build
WORKDIR /web
COPY frontend/package*.json ./
RUN npm install
COPY frontend ./
RUN npm run build

FROM maven:3.9-eclipse-temurin-21 AS api-build
WORKDIR /build
COPY backend/pom.xml ./
RUN mvn -B dependency:go-offline
COPY backend/src ./src
COPY --from=frontend-build /web/dist ./src/main/resources/static
RUN mvn -B package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=api-build /build/target/donation-ledger-api-1.0.0.jar app.jar
ENV PORT=8080
EXPOSE 8080
CMD ["java", "-jar", "app.jar"]
