# Dev environment — small instance classes, single-AZ
terraform {
  required_version = ">= 1.7.0"
  backend "s3" {
    bucket  = "windels-tfstate-dev"
    key     = "windels/dev/terraform.tfstate"
    region  = "us-east-1"
    encrypt = true
  }
}

module "windels" {
  source = "../../"
  environment         = "dev"
  aws_region          = "us-east-1"
  availability_zones  = ["us-east-1a"]
  db_instance_class   = "db.t4g.micro"
  cache_instance_class = "cache.t4g.micro"
  db_allocated_storage = 20
}
