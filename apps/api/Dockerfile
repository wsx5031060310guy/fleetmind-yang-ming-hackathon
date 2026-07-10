FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml ./pom.xml
COPY core-calc ./core-calc
COPY apps/api ./apps/api
RUN mvn -q -pl apps/api -am package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/apps/api/target/fleetmind-api-*.jar /app/fleetmind-api.jar
# Runtime platforms may inject PORT; local/container default remains 8080.
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "exec java -Dserver.port=${PORT:-8080} -jar /app/fleetmind-api.jar"]
