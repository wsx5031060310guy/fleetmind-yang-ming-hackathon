#!/usr/bin/env bash

curl_safe() {
  curl --fail --silent --show-error \
    --connect-timeout 3 --max-time 12 \
    --retry 2 --retry-all-errors "$@"
}

curl_post_safe() {
  curl --fail --silent --show-error \
    --connect-timeout 3 --max-time 12 \
    -X POST "$@"
}
