terraform {
  required_version = ">= 1.7.0"
  backend "s3" {
    bucket  = "windels-tfstate-staging"
    key     = "windels/staging/terraform.tfstate"
    region  = "us-east-1"
    encrypt = true
  }
}

module "windels" {
  source = "../../"
  environment         = "staging"
  aws_region          = "us-east-1"
  availability_zones  = ["us-east-1a", "us-east-1b"]
  db_instance_class   = "db.t4g.small"
  cache_instance_class = "cache.t4g.small"
  db_allocated_storage = 20
}
