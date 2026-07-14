FROM maven:3.9.11-eclipse-temurin-21-alpine AS build
WORKDIR /workspace

COPY pom.xml ./pom.xml
COPY core-calc/pom.xml ./core-calc/pom.xml
COPY apps/api/pom.xml ./apps/api/pom.xml
RUN mvn -B -q -pl apps/api -am \
    org.apache.maven.plugins:maven-dependency-plugin:3.7.0:go-offline

COPY core-calc ./core-calc
COPY apps/api ./apps/api
RUN set -eux; \
    mkdir -p /workspace/container-metrics; \
    if [ -f /workspace/core-calc/target/real-metrics.json ]; then \
      cp /workspace/core-calc/target/real-metrics.json \
        /workspace/container-metrics/real-metrics.json; \
    fi; \
    mvn -B -q -pl apps/api -am clean package -DskipTests

FROM eclipse-temurin:21.0.8_9-jre-alpine-3.22 AS runtime
WORKDIR /app

RUN addgroup -S fleetmind \
    && adduser -S -D -H -G fleetmind -h /app fleetmind

COPY --from=build --chown=fleetmind:fleetmind \
  /workspace/apps/api/target/fleetmind-api-*.jar /app/fleetmind-api.jar
COPY --from=build --chown=fleetmind:fleetmind \
  /workspace/container-metrics/ /app/
COPY --chown=fleetmind:fleetmind --chmod=0555 \
  apps/api/container-entrypoint.sh /app/container-entrypoint.sh

USER fleetmind
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -q -T 3 -O /dev/null \
    "http://127.0.0.1:${PORT:-8080}/api/health" || exit 1

ENTRYPOINT ["/app/container-entrypoint.sh"]
