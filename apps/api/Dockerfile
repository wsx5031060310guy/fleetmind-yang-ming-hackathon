FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml ./pom.xml
COPY core-calc ./core-calc
COPY apps/api ./apps/api
RUN mvn -q -pl apps/api -am package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/apps/api/target/fleetmind-api-0.1.0-SNAPSHOT.jar /app/fleetmind-api.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/fleetmind-api.jar"]
