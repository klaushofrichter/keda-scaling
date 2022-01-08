#!/bin/bash
# this installs keda
set -e
source ./config.sh
[ -z "${KUBECONFIG}" ] && echo "KUBECONFIG not defined. Exit." && exit 1

#
# remove existing installation
./keda-undeploy.sh

echo
echo "==== $0: Deploy keda, chart version ${KEDACHART}"
cat keda-values.yaml.template | envsubst | helm install -f - keda kedacore/keda --version ${KEDACHART} -n keda --create-namespace

echo
echo "==== $0: Deploy the scaled object for the app"
cat app-scaledobject.yaml.template | envsubst | kubectl apply -f - 

#
# patch the resources for metrics server. The value in keda-values.yaml.template is for both controller and metrics,
# so we overwrite one of them to have individual values
if [ "${PATCHRESOURCES}" == "yes" ]; then
  echo
  echo "==== $0: Patching resource settings for the metrics server"
  kubectl rollout status deployment keda-operator-metrics-api-server -n keda --request-timeout 5m
  kubectl patch deployment keda-operator-metrics-api-server -n keda -p '{"spec":{"template":{"spec":{"containers":[{"name":"keda-operator-metrics-api-server", "resources":{"limits":{"cpu":"110m","memory":"120M"},"requests":{"cpu":"25m","memory":"50M"}}}]}}}}'
fi

echo
echo "==== $0: Wait for keda to finish deployment"
kubectl rollout status deployment.apps keda-operator-metrics-apiserver -n keda --request-timeout 5m
kubectl rollout status deployment.apps keda-operator -n keda --request-timeout 5m

