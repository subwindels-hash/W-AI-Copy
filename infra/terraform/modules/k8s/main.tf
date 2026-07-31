# ── Deploy WINDELS manifests into an existing K8s cluster ──────────────────
# This module assumes a K8s cluster already exists (EKS/GKE/self-hosted).
# It applies the ../k8s (kustomize) manifests via kubectl + Terraform null_resource
# so Terraform tracks the deploy. (For full EKS cluster creation, add eks
# blueprints module in environments/prod/k8s.tf.)

resource "null_resource" "apply_manifests" {
  triggers = {
    manifest_hash = filesha256("${path.module}/../../../../k8s/kustomization.yaml")
    image_tag     = var.image_tag
  }

  provisioner "local-exec" {
    command = <<-EOT
      set -euo pipefail
      cd "${path.module}/../../../../k8s"
      kustomize edit set image ghcr.io/windels-ai/windels=${var.image_api}
      kustomize edit set image ghcr.io/windels-ai/windels-web=${var.image_web}
      kubectl apply -k .
      kubectl rollout status deployment/windels-api -n ${var.namespace} --timeout=180s
      kubectl rollout status deployment/windels-web -n ${var.namespace} --timeout=180s
    EOT
  }
}
