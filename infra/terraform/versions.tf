terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.32"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.14"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }

  # Remote state — configure per environment in environments/<env>/main.tf
  backend "s3" {
    # Example; override per env:
    # bucket         = "windels-tfstate-<account>"
    # key            = "windels/<env>/terraform.tfstate"
    # region         = "us-east-1"
    # dynamodb_table = "windels-tflock"
    # encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "windels-ai-os"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
