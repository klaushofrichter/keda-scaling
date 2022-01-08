#!/bin/bash
# this installs the app
set -e
source ./config.sh
[ -z "${KUBECONFIG}" ] && echo "KUBECONFIG not defined. Exit." && exit 1

echo
echo "==== $0: Build app image ${APP}:${VERSION}"
npm install
docker build -t ${APP}:${VERSION} .

echo
echo "==== $0: Import new image ${APP}:${VERSION} to k3d ${CLUSTER} (this may take a while)"
k3d image import ${APP}:${VERSION} -c ${CLUSTER} --keep-tools

#
# remove existing deployment
./app-undeploy.sh

echo
echo "==== $0: Deploy application (namespace, pods, service, ingress)"
cat app.yaml.template | envsubst "${ENVSUBSTVAR}" | kubectl create -f - --save-config

#
# if keda the keda scaleobject CRD exists, deploy it for the app
if [ "$(kubectl get crd | grep '^scaledobjects.keda.sh' | cut -d ' ' -f1)" == "scaledobjects.keda.sh" ]; then
  echo 
  echo "==== $0: Deploying scaledobject for ${APP} because the CRD exists"
  cat app-scaledobject.yaml.template | envsubst | kubectl apply -f -
fi

#
# label the namespace for Goldilocks
if [ "${GOLDILOCKS_ENABLE}" == "yes" ]; then
  echo 
  echo "==== $0: Labeling the namespace for Goldilocks"
  kubectl label namespace ${APP} goldilocks.fairwinds.com/enabled=true --overwrite
fi

echo
echo "==== $0: Wait for ${APP} deployment to finish"
kubectl rollout status deployment.apps ${APP}-deploy -n ${APP} --request-timeout 5m

